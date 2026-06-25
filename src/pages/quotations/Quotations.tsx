import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { getCompanies } from '@/services/companyService'
import { useCompanyStore } from '@/store/useCompanyStore'
import { Routes, Route, useNavigate } from 'react-router-dom'
import {
  useQuotationSummaries, useCreateQuotation, useUpdateQTStatus,
  useUpdateQuotation, useDeleteInvoiceTerm, useUpsertClient,
  useClients, useServices, useInvoiceTerms, useCreateInvoiceTerms,
} from '@/hooks/useFinrok'
import {
  PageHeader, StatusBadge, Button, Input, Select, Textarea,
  Modal, EmptyState, LoadingSpinner, Amount,
} from '@/components/shared'
import { formatRp, formatDate, generateClientCode, parseQTNotes, composeQTNotes } from '@/lib/utils'
import type { QuotationSummary, QTStatus } from '@/types/database'
import { Plus, Search, FileText, ChevronDown, Check, X, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, StickyNote, MoreVertical, ListChecks, RefreshCw } from 'lucide-react'

// ─── Main list ────────────────────────────────────────────────
export default function Quotations() {
  return (
    <Routes>
      <Route index element={<QuotationList />} />
    </Routes>
  )
}

function QuotationList() {
  const { selectedCompanyId } = useCompanyStore()
  const { data: summaries, isLoading } = useQuotationSummaries(selectedCompanyId)
  const { data: clients }  = useClients()
  const { data: services } = useServices()
  const createQT  = useCreateQuotation()
  const updateStatus = useUpdateQTStatus()
  const navigate  = useNavigate()

  const [search, setSearch]         = useState('')
  const [filterStatus, setFilter]   = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [showStatus, setShowStatus] = useState<QuotationSummary | null>(null)
  const [showTerms, setShowTerms]   = useState<QuotationSummary | null>(null)
  const [showEdit, setShowEdit]     = useState<QuotationSummary | null>(null)
  const [sortKey, setSortKey]       = useState<'qt_number'|'qt_date'|'client_name'|'service_code'|'title'|'nominal'|'total_terms'|'qt_status'>('qt_date')
  const [sortDir, setSortDir]       = useState<'asc'|'desc'>('desc')
  const updateQT    = useUpdateQuotation()

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ keyName }: { keyName: typeof sortKey }) => {
    if (sortKey !== keyName) return <ArrowUpDown size={12} className="text-muted-foreground" />
    return sortDir === 'asc'
      ? <ArrowUp size={12} className="text-rok-600" />
      : <ArrowDown size={12} className="text-rok-600" />
  }

  // Filter
  const filtered = summaries?.filter(q => {
    const matchStatus = filterStatus === 'all' || q.qt_status === filterStatus
    const s = search.toLowerCase()
    const matchSearch = !s || q.qt_number.toLowerCase().includes(s) || q.client_name.toLowerCase().includes(s) || q.title.toLowerCase().includes(s)
    return matchStatus && matchSearch
  }) ?? []

  const sorted = [...filtered].sort((a, b) => {
    const factor = sortDir === 'asc' ? 1 : -1
    switch (sortKey) {
      case 'qt_number':   return factor * a.qt_number.localeCompare(b.qt_number)
      case 'qt_date':     return factor * (new Date(a.qt_date).getTime() - new Date(b.qt_date).getTime())
      case 'client_name': return factor * a.client_name.localeCompare(b.client_name)
      case 'service_code':return factor * a.service_code.localeCompare(b.service_code)
      case 'title':       return factor * a.title.localeCompare(b.title)
      case 'nominal':     return factor * (a.nominal - b.nominal)
      case 'total_terms': return factor * (a.total_terms - b.total_terms)
      case 'qt_status':   return factor * a.qt_status.localeCompare(b.qt_status)
    }
  })

  const total_nominal = sorted.reduce((s, q) => s + q.nominal, 0)
  const total_paid    = sorted.reduce((s, q) => s + q.total_paid, 0)

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="page">
      <PageHeader
        title="Quotations"
        sub={`${filtered.length} quotation ditemukan`}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Buat QT Baru
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-rok-400"
            placeholder="Cari nomor QT, client, judul..."
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        {(['all','draft','sent','deal','lost'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === s ? 'bg-rok-500 text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
          >
            {s === 'all' ? 'Semua' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        {/* Totals */}
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span>Total nominal: <strong className="text-foreground num">{formatRp(total_nominal, { short: true })}</strong></span>
          <span>Total paid: <strong className="text-green-600 num">{formatRp(total_paid, { short: true })}</strong></span>
        </div>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <EmptyState title="Belum ada quotation" description="Buat quotation pertama untuk memulai." action={<Button onClick={() => setShowCreate(true)}><Plus size={14} /> Buat QT</Button>} />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer" onClick={() => toggleSort('qt_number')}><span className="inline-flex items-center gap-1">QT Number <SortIcon keyName="qt_number" /></span></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer" onClick={() => toggleSort('qt_date')}><span className="inline-flex items-center gap-1">Date <SortIcon keyName="qt_date" /></span></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer" onClick={() => toggleSort('client_name')}><span className="inline-flex items-center gap-1">Client <SortIcon keyName="client_name" /></span></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer" onClick={() => toggleSort('service_code')}><span className="inline-flex items-center gap-1">Service <SortIcon keyName="service_code" /></span></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer" onClick={() => toggleSort('title')}><span className="inline-flex items-center gap-1">Judul <SortIcon keyName="title" /></span></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer" onClick={() => toggleSort('nominal')}><span className="inline-flex items-center gap-1">Nominal <SortIcon keyName="nominal" /></span></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer" onClick={() => toggleSort('total_terms')}><span className="inline-flex items-center gap-1">Termin <SortIcon keyName="total_terms" /></span></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer" onClick={() => toggleSort('qt_status')}><span className="inline-flex items-center gap-1">Status <SortIcon keyName="qt_status" /></span></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((qt, i) => (
                <tr key={qt.id} className={`border-b border-border last:border-0 hover:bg-rok-50/30 transition-colors ${i%2===0?'bg-white':'bg-secondary/10'}`}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-rok-700 font-medium">{qt.qt_number}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(qt.qt_date)}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-foreground">{qt.client_name}</p>
                      <p className="text-[11px] text-muted-foreground">{qt.client_code}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{qt.service_code}</td>
                  <td className="px-4 py-3 min-w-[280px] max-w-[360px]">
                    <div className="flex items-start gap-1.5">
                      <p className="text-xs text-foreground line-clamp-2" title={qt.title}>{qt.title}</p>
                      <NoteIndicator notes={qt.notes} />
                    </div>
                    {qt.project_name && <p className="text-[11px] text-muted-foreground">📁 {qt.project_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Amount value={qt.nominal} className="text-xs" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {qt.total_terms > 0 ? (
                      <span className="text-xs">
                        <span className="text-green-600 font-medium">{qt.paid_terms}</span>
                        <span className="text-muted-foreground">/{qt.total_terms}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={qt.qt_status} type="qt" />
                  </td>
                  <td className="px-4 py-3">
                    <QtRowActions
                      onEdit={() => setShowEdit(qt)}
                      onStatus={() => setShowStatus(qt)}
                      onTerms={qt.qt_status === 'deal' ? () => setShowTerms(qt) : undefined}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create QT Modal */}
      <CreateQTModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        clients={clients ?? []}
        services={services ?? []}
        onSubmit={async (data) => {
          await createQT.mutateAsync(data)
          setShowCreate(false)
        }}
        loading={createQT.isPending}
      />

      {/* Update Status Modal */}
      {showStatus && (
        <UpdateStatusModal
          qt={showStatus}
          onClose={() => setShowStatus(null)}
          onUpdate={async (to, notes) => {
            await updateStatus.mutateAsync({ id: showStatus.id, from_status: showStatus.qt_status, to_status: to, notes })
            setShowStatus(null)
          }}
          loading={updateStatus.isPending}
        />
      )}

      {/* Setup Termin Modal */}
      {showTerms && (
        <SetupTerminModal
          qt={showTerms}
          onClose={() => setShowTerms(null)}
        />
      )}

      {/* Edit QT Modal */}
      {showEdit && (
        <EditQTModal
          qt={showEdit}
          onClose={() => setShowEdit(null)}
          onSubmit={async (data) => {
            await updateQT.mutateAsync({ id: showEdit.id, ...data })
            setShowEdit(null)
          }}
          loading={updateQT.isPending}
        />
      )}
    </div>
  )
}

// ─── Note Indicator ──────────────────────────────────────────
// Ikon catatan + popover. Hanya menampilkan bagian catatan user
// (metadata pajak Tax/Subtotal/dst disembunyikan).
function NoteIndicator({ notes }: { notes: string | null }) {
  const { userNote } = parseQTNotes(notes)
  if (!userNote) return null
  return (
    <span className="group relative inline-flex shrink-0">
      <StickyNote size={13} className="text-amber-500 cursor-help" />
      <span className="pointer-events-none absolute left-0 bottom-full z-20 mb-1.5 hidden group-hover:block">
        <span className="block w-[320px] whitespace-pre-wrap rounded-md bg-slate-800 px-3 py-2 text-[11px] leading-snug text-white shadow-lg">
          {userNote}
        </span>
      </span>
    </span>
  )
}

// ─── Row Actions (kebab menu, sama seperti tabel Invoices) ───
function QtRowActions({ onEdit, onStatus, onTerms }: { onEdit: () => void; onStatus: () => void; onTerms?: () => void }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    place()
    const onDown = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onClose = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [open])

  const item = (key: string, icon: ReactNode, label: string, color: string, run: () => void) => (
    <button
      key={key}
      type="button"
      onClick={() => { run(); setOpen(false) }}
      className={`w-full px-3 py-2 flex items-center gap-2 text-left text-xs font-medium hover:bg-secondary/60 ${color}`}
    >
      {icon}{label}
    </button>
  )

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Aksi"
        onClick={() => setOpen(o => !o)}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground ${open ? 'bg-secondary text-foreground' : ''}`}
      >
        <MoreVertical size={15} />
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 60 }}
          className="min-w-[160px] overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg"
        >
          {item('edit', <RefreshCw size={13} />, 'Edit', 'text-amber-700', onEdit)}
          {item('status', <Pencil size={13} />, 'Status', 'text-rok-600', onStatus)}
          {onTerms && item('terms', <ListChecks size={13} />, 'Termin', 'text-green-700', onTerms)}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Create QT Modal ─────────────────────────────────────────
function CreateQTModal({ open, onClose, clients, services, onSubmit, loading }: any) {
  const { selectedCompanyId } = useCompanyStore()
  const upsertClient = useUpsertClient()
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
  })

  const [form, setForm] = useState({
    client_id:  '',
    service_id: '',
    company_id: '',
    title:      '',
    nominal:    '',
    tax_type:   'none',
    qt_date:    new Date().toISOString().split('T')[0],
    notes:      '',
  })
  const [showAddClient, setShowAddClient] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', code: '' })
  const [addClientErr, setAddClientErr] = useState('')

  // Set default company: ikuti company filter aktif, fallback ke is_default
  useEffect(() => {
    if (companies.length > 0) {
      const target = selectedCompanyId
        ? companies.find((c: any) => c.id === selectedCompanyId)
        : companies.find((c: any) => c.is_default)
      if (target) setForm(f => ({ ...f, company_id: target.id }))
    }
  }, [companies, selectedCompanyId])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setNew = (k: string, v: string) => setNewClient(c => ({ ...c, [k]: v }))

  const selectedClient  = clients.find((c: any) => c.id === form.client_id)
  const selectedService = services.find((s: any) => s.id === form.service_id)
  const subtotal = parseFloat(form.nominal) || 0
  const taxAmount = form.tax_type === 'ppn11' ? Math.round(subtotal * 0.11) : 0
  const grandTotal = subtotal + taxAmount

  const handleAddClient = async () => {
    const name = newClient.name.trim()
    const code = newClient.code.trim().toUpperCase()
    if (!name || !code) {
      setAddClientErr('Nama client dan kode client wajib diisi.')
      return
    }
    const exists = clients.some((c: any) => (c.code ?? '').toUpperCase() === code)
    if (exists) {
      setAddClientErr(`Kode client "${code}" sudah dipakai.`)
      return
    }
    setAddClientErr('')
    const created = await upsertClient.mutateAsync({ name, code, is_active: true })
    set('client_id', created.id)
    setShowAddClient(false)
    setNewClient({ name: '', code: '' })
  }

  const handleSubmit = () => {
    if (!form.client_id || !form.service_id || !form.title || !form.nominal) return
    onSubmit({
      ...form,
      nominal:      grandTotal,
      client_code:  selectedClient?.code ?? generateClientCode(selectedClient?.name ?? ''),
      service_code: selectedService?.code ?? '',
      notes:        [form.notes?.trim(), `Tax: ${form.tax_type === 'ppn11' ? 'PPN 11%' : 'Non-PPN'}`, `Subtotal: ${subtotal}`, `Tax Amount: ${taxAmount}`, `Grand Total: ${grandTotal}`]
        .filter(Boolean)
        .join('\n'),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Buat Quotation Baru" width="max-w-xl">
      <div className="space-y-4">

        {/* Company selector */}
        <Select
          label="Company *"
          value={form.company_id}
          onChange={e => set('company_id', e.target.value)}
        >
          <option value="">Pilih company...</option>
          {companies.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.is_default ? ' (default)' : ''}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Select label="Client *" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
              <option value="">Pilih client...</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <button
              type="button"
              onClick={() => setShowAddClient(v => !v)}
              className="text-[11px] text-rok-600 hover:underline"
            >
              + Tambah client baru
            </button>
          </div>
          <Select label="Service *" value={form.service_id} onChange={e => set('service_id', e.target.value)}>
            <option value="">Pilih service...</option>
            {services.map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </Select>
        </div>
        {showAddClient && (
          <div className="rounded-md border border-rok-200 bg-rok-50/40 p-3 space-y-2">
            <p className="text-xs font-medium text-rok-700">Tambah Client Baru</p>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Nama Client *" placeholder="PT Nama Client" value={newClient.name} onChange={e => setNew('name', e.target.value)} />
              <Input label="Kode Client *" placeholder="ABC" value={newClient.code} onChange={e => setNew('code', e.target.value.toUpperCase())} />
            </div>
            {addClientErr && <p className="text-[11px] text-destructive">{addClientErr}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowAddClient(false); setAddClientErr('') }}>Batal</Button>
              <Button size="sm" onClick={handleAddClient} loading={upsertClient.isPending}>Simpan Client</Button>
            </div>
          </div>
        )}
        <Input label="Tanggal QT *" type="date" value={form.qt_date} onChange={e => set('qt_date', e.target.value)} />
        <Input label="Judul / Deskripsi Pekerjaan *" placeholder="Pengadaan Tenaga Ahli..." value={form.title} onChange={e => set('title', e.target.value)} />
        <Input label="Subtotal / DPP (Rp) *" type="number" placeholder="42000000" value={form.nominal} onChange={e => set('nominal', e.target.value)} />
        <Select label="Tax / PPN" value={form.tax_type} onChange={e => set('tax_type', e.target.value)}>
          <option value="none">Non-PPN</option>
          <option value="ppn11">PPN 11%</option>
        </Select>
        <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium num">{formatRp(subtotal)}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">PPN</span><span className="font-medium num">{formatRp(taxAmount)}</span></div>
          <div className="border-t border-border pt-1.5 flex items-center justify-between"><span className="font-semibold text-foreground">Grand Total</span><span className="font-semibold text-rok-700 num">{formatRp(grandTotal)}</span></div>
        </div>
        <Textarea label="Catatan (opsional)" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />

        {form.client_id && form.service_id && form.nominal && (
          <div className="bg-secondary/50 rounded-md p-3 text-xs text-muted-foreground">
            Preview nomor QT: <span className="font-mono font-medium text-foreground">QT-XXX_{selectedService?.code?.toUpperCase()}-{selectedClient?.code?.toUpperCase()}_{new Date(form.qt_date).toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'2-digit'}).replace(/\//g,'')}</span>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            onClick={handleSubmit}
            loading={loading}
            disabled={!form.client_id || !form.service_id || !form.title || !form.nominal || !form.company_id}
          >
            <FileText size={13} /> Buat Quotation
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Update Status Modal ─────────────────────────────────────
function UpdateStatusModal({ qt, onClose, onUpdate, loading }: any) {
  const [to, setTo]       = useState<QTStatus>(qt.qt_status)
  const [notes, setNotes] = useState('')

  return (
    <Modal open title={`Update Status — ${qt.qt_number}`} onClose={onClose} width="max-w-sm">
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Status saat ini</p>
          <StatusBadge status={qt.qt_status} type="qt" />
        </div>
        <Select label="Ubah status ke" value={to} onChange={e => setTo(e.target.value as QTStatus)}>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="deal">Deal ✓</option>
          <option value="lost">Lost ✗</option>
        </Select>
        {to === 'lost' && (
          <Textarea label="Alasan lost *" rows={2} placeholder="Kenapa klien tidak jadi?" value={notes} onChange={e => setNotes(e.target.value)} />
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            onClick={() => onUpdate(to, notes)}
            loading={loading}
            variant={to === 'lost' ? 'destructive' : 'default'}
            disabled={to === 'lost' && !notes}
          >
            {to === 'deal' ? <Check size={13} /> : to === 'lost' ? <X size={13} /> : null}
            Simpan
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Setup Termin Modal ───────────────────────────────────────
type TermEntry = { label: string; nominal: string; est_date: string; mode: 'rp' | 'pct'; pct: string }

function SetupTerminModal({ qt, onClose }: any) {
  const navigate = useNavigate()
  const { data: existingTerms } = useInvoiceTerms(qt.id)
  const createTerms = useCreateInvoiceTerms()
  const [numTerms, setNumTerms] = useState(1)
  const [terms, setTerms] = useState<TermEntry[]>([{ label: '', nominal: '', est_date: '', mode: 'rp', pct: '' }])

  const setTerm = (i: number, k: string, v: string) => {
    setTerms(prev => prev.map((t, idx) => {
      if (idx !== i) return t
      const updated = { ...t, [k]: v }
      if (k === 'pct') {
        const pctVal = parseFloat(v) || 0
        updated.nominal = pctVal > 0 ? String(Math.round(qt.nominal * pctVal / 100)) : ''
      }
      return updated
    }))
  }

  const toggleMode = (i: number) => {
    setTerms(prev => prev.map((t, idx) => {
      if (idx !== i) return t
      const newMode = t.mode === 'rp' ? 'pct' : 'rp'
      return { ...t, mode: newMode, pct: newMode === 'pct' && t.nominal ? String(Math.round(parseFloat(t.nominal) / qt.nominal * 100)) : t.pct }
    }))
  }

  const handleNumChange = (n: number) => {
    setNumTerms(n)
    setTerms(Array.from({ length: n }, (_, i) => terms[i] ?? { label: `Termin ${i+1} dari ${n}`, nominal: '', est_date: '', mode: 'rp', pct: '' }))
  }

  const totalTermin = terms.reduce((s, t) => s + (parseFloat(t.nominal) || 0), 0)
  const selisih = qt.nominal - totalTermin

  const handleSubmit = async () => {
    await createTerms.mutateAsync({
      quotation_id: qt.id,
      total_terms: numTerms,
      terms: terms.map((t, i) => ({
        term_number: i + 1,
        label: t.label || `${qt.title} — Termin ${i+1} dari ${numTerms}`,
        nominal: parseFloat(t.nominal),
        est_date: t.est_date,
      })),
    })
    onClose()
  }

  if (existingTerms && existingTerms.length > 0) {
    return (
      <Modal open title={`Termin — ${qt.qt_number}`} onClose={onClose} width="max-w-lg">
        <p className="text-sm text-muted-foreground mb-4">Termin sudah disetup ({existingTerms.length} termin)</p>
        <div className="space-y-2">
          {existingTerms.map(t => {
            // Invoice aktif bisa lewat anchor (t.invoice) atau combined invoice (junction links).
            const linkedActive = (t.links ?? []).map(l => l.invoice).find(i => i && i.status !== 'void')
            const activeInv = linkedActive ?? (t.invoice && t.invoice.status !== 'void' ? t.invoice : null)
            return (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
              <div>
                <p className="text-xs font-medium">{t.label}</p>
                <p className="text-[11px] text-muted-foreground">Est: {formatDate(t.est_date)}</p>
                {activeInv ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/invoices?invoice=${activeInv.id}`)}
                    className="text-[11px] text-rok-600 hover:underline font-medium mt-0.5"
                  >
                    {activeInv.inv_number}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(`/invoices/generate/${t.id}`)}
                    className="text-[11px] text-green-700 hover:underline font-medium mt-0.5"
                  >
                    Generate Invoice
                  </button>
                )}
              </div>
              <div className="text-right">
                <Amount value={t.nominal} className="text-xs" />
                <StatusBadge status={t.status} type="term" />
              </div>
            </div>
            )
          })}
        </div>
        <div className="mt-4 flex justify-end"><Button variant="outline" onClick={onClose}>Tutup</Button></div>
      </Modal>
    )
  }

  return (
    <Modal open title={`Setup Termin — ${qt.qt_number}`} onClose={onClose} width="max-w-xl">
      <div className="space-y-4">
        <div className="bg-secondary/40 rounded-md p-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Total nominal QT</span>
          <Amount value={qt.nominal} className="text-sm font-semibold" />
        </div>

        <Select label="Jumlah termin" value={String(numTerms)} onChange={e => handleNumChange(Number(e.target.value))}>
          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} termin</option>)}
        </Select>

        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
          {terms.map((t, i) => (
            <div key={i} className="p-3 rounded-md border border-border bg-white">
              <p className="text-xs font-medium text-muted-foreground mb-2">Termin {i+1}</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3">
                  <Input
                    label="Label"
                    placeholder={`${qt.title} — Termin ${i+1} dari ${numTerms}`}
                    value={t.label}
                    onChange={e => setTerm(i, 'label', e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Nominal *</span>
                    <button
                      type="button"
                      onClick={() => toggleMode(i)}
                      className="text-[10px] px-2 py-0.5 rounded border border-rok-300 bg-rok-50 text-rok-700 hover:bg-rok-100 font-medium transition-colors"
                    >
                      {t.mode === 'rp' ? 'Ganti ke %' : 'Ganti ke Rp'}
                    </button>
                  </div>
                  {t.mode === 'rp' ? (
                    <input
                      type="number"
                      className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-rok-400"
                      placeholder="Nominal (Rp)"
                      value={t.nominal}
                      onChange={e => setTerm(i, 'nominal', e.target.value)}
                    />
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0" max="100" step="0.5"
                          className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-rok-400"
                          placeholder="Persentase (%)"
                          value={t.pct}
                          onChange={e => setTerm(i, 'pct', e.target.value)}
                        />
                        <span className="text-sm font-medium text-muted-foreground">%</span>
                      </div>
                      {t.nominal && (
                        <p className="text-[11px] text-rok-700 font-medium">= {formatRp(parseFloat(t.nominal))}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <Input label="Est. Tanggal Invoice *" type="date" value={t.est_date} onChange={e => setTerm(i, 'est_date', e.target.value)} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={`rounded-md p-2.5 text-xs flex items-center justify-between ${Math.abs(selisih) < 1 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          <span>Total termin: <strong className="num">{formatRp(totalTermin)}</strong></span>
          {Math.abs(selisih) >= 1 && <span>Selisih: <strong>{formatRp(Math.abs(selisih))}</strong> {selisih > 0 ? '(kurang)' : '(lebih)'}</span>}
          {Math.abs(selisih) < 1 && <span>✓ Total sesuai nominal QT</span>}
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            onClick={handleSubmit}
            loading={createTerms.isPending}
            disabled={Math.abs(selisih) >= 1 || terms.some(t => !t.nominal || !t.est_date)}
          >
            Simpan Termin
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Edit QT Modal ───────────────────────────────────────────
function EditQTModal({ qt, onClose, onSubmit, loading }: any) {
  const [form, setForm] = useState({ title: qt.title, nominal: String(qt.nominal), notes: parseQTNotes(qt.notes).userNote })
  const { data: existingTerms } = useInvoiceTerms(qt.id)
  const deleteTermMutation = useDeleteInvoiceTerm()
  const createTermsMutation = useCreateInvoiceTerms()
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const [newTerms, setNewTerms] = useState<{ label: string; nominal: string; est_date: string; mode: 'rp'|'pct'; pct: string }[]>([])
  const [showAddTerms, setShowAddTerms] = useState(false)

  const nominalQT = parseFloat(form.nominal) || qt.nominal
  const existingTotal = (existingTerms ?? []).reduce((s, t) => s + t.nominal, 0)
  const newTermsTotal = newTerms.reduce((s, t) => s + (parseFloat(t.nominal) || 0), 0)
  const allTotal = existingTotal + newTermsTotal
  const selisih = nominalQT - allTotal
  const isBalanced = Math.abs(selisih) < 1

  const addNewTerm = () => {
    const remaining = nominalQT - existingTotal - newTermsTotal
    setNewTerms(prev => [...prev, {
      label: '',
      nominal: remaining > 0 ? String(Math.round(remaining)) : '',
      est_date: '',
      mode: 'rp',
      pct: '',
    }])
  }

  const setNewTerm = (i: number, k: string, v: string) => {
    setNewTerms(prev => prev.map((t, idx) => {
      if (idx !== i) return t
      const updated = { ...t, [k]: v }
      if (k === 'pct') {
        const pctVal = parseFloat(v) || 0
        updated.nominal = pctVal > 0 ? String(Math.round(nominalQT * pctVal / 100)) : ''
      }
      return updated
    }))
  }

  const toggleNewTermMode = (i: number) => {
    setNewTerms(prev => prev.map((t, idx) => {
      if (idx !== i) return t
      const newMode = t.mode === 'rp' ? 'pct' : 'rp'
      return { ...t, mode: newMode, pct: newMode === 'pct' && t.nominal ? String(Math.round(parseFloat(t.nominal) / nominalQT * 100)) : t.pct }
    }))
  }

  const removeNewTerm = (i: number) => setNewTerms(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    if (!form.title || !form.nominal) return
    // Pertahankan metadata pajak (Tax/Subtotal/dst) yang ada di notes asli.
    const { metaLines } = parseQTNotes(qt.notes)
    await onSubmit({ title: form.title, nominal: parseFloat(form.nominal), notes: composeQTNotes(form.notes, metaLines) ?? undefined })
    if (newTerms.length > 0 && newTerms.every(t => t.nominal && t.est_date)) {
      const existingCount = existingTerms?.length ?? 0
      const totalTerms = existingCount + newTerms.length
      await createTermsMutation.mutateAsync({
        quotation_id: qt.id,
        total_terms: totalTerms,
        terms: newTerms.map((t, i) => ({
          term_number: existingCount + i + 1,
          label: t.label || `Termin ${existingCount + i + 1}`,
          nominal: parseFloat(t.nominal),
          est_date: t.est_date,
        })),
      })
    }
  }

  const canDeleteTerm = (status: string) => ['not_yet', 'need_created'].includes(status)
  const isSaving = loading || createTermsMutation.isPending || deleteTermMutation.isPending

  return (
    <Modal open title={`Edit QT — ${qt.qt_number}`} onClose={onClose} width="max-w-xl">
      <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        <div className="rounded-lg border border-border bg-white p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Info Quotation</p>
          <div className="text-xs text-muted-foreground bg-secondary/40 rounded p-2">
            Client: <strong>{qt.client_name}</strong> · Service: <strong>{qt.service_code}</strong>
          </div>
          <Input label="Judul *" value={form.title} onChange={e => set('title', e.target.value)} />
          <Input label="Nominal (Rp) *" type="number" value={form.nominal} onChange={e => set('nominal', e.target.value)} />
          <Textarea label="Notes (opsional)" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        {existingTerms && existingTerms.length > 0 && (
          <div className="rounded-lg border border-border bg-white p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Termin yang Ada</p>
            <p className="text-[11px] text-muted-foreground">Status waiting/paid/overdue tidak bisa dihapus.</p>
            {existingTerms.map(t => (
              <div key={t.id} className="flex items-center justify-between p-2.5 rounded-md border border-border bg-secondary/20">
                <div>
                  <p className="text-xs font-medium">{t.label}</p>
                  <p className="text-[11px] text-muted-foreground">{formatRp(t.nominal)} · Est: {formatDate(t.est_date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={t.status} type="term" />
                  {canDeleteTerm(t.status) && (
                    <button onClick={async () => { if (confirm('Hapus termin ini?')) try { await deleteTermMutation.mutateAsync(t.id) } catch { alert('Gagal menghapus termin. Periksa koneksi atau hubungi admin.') } }}
                      className="text-red-400 hover:text-red-600" disabled={deleteTermMutation.isPending}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tambah Termin Baru</p>
            <button onClick={addNewTerm} className="text-xs text-rok-600 hover:underline font-medium flex items-center gap-1">
              <Plus size={11} /> Tambah Termin
            </button>
          </div>

          {newTerms.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Klik "Tambah Termin" untuk menambah termin baru.</p>
          )}

          {newTerms.map((t, i) => (
            <div key={i} className="p-3 rounded-md border border-rok-200 bg-rok-50/30 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-rok-700">Termin Baru {i + 1}</p>
                <button onClick={() => removeNewTerm(i)} className="text-red-400 hover:text-red-600"><X size={13} /></button>
              </div>
              <Input label="Label" placeholder={`Termin ${(existingTerms?.length ?? 0) + i + 1}`}
                value={t.label} onChange={e => setNewTerm(i, 'label', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Nominal *</span>
                    <button type="button" onClick={() => toggleNewTermMode(i)}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-rok-300 bg-rok-50 text-rok-700 hover:bg-rok-100">
                      {t.mode === 'rp' ? '% mode' : 'Rp mode'}
                    </button>
                  </div>
                  {t.mode === 'rp' ? (
                    <input type="number" className="w-full px-2 py-1.5 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-rok-400"
                      placeholder="Nominal Rp" value={t.nominal} onChange={e => setNewTerm(i, 'nominal', e.target.value)} />
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" max="100" step="0.5"
                          className="w-full px-2 py-1.5 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-rok-400"
                          placeholder="%" value={t.pct} onChange={e => setNewTerm(i, 'pct', e.target.value)} />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      {t.nominal && <p className="text-[10px] text-rok-700">= {formatRp(parseFloat(t.nominal))}</p>}
                    </div>
                  )}
                </div>
                <Input label="Est. Tanggal *" type="date" value={t.est_date} onChange={e => setNewTerm(i, 'est_date', e.target.value)} />
              </div>
            </div>
          ))}

          {(existingTerms?.length ?? 0) + newTerms.length > 0 && (
            <div className={`rounded-md p-2.5 text-xs flex items-center justify-between ${isBalanced ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              <span>Total termin: <strong>{formatRp(allTotal)}</strong> / QT: <strong>{formatRp(nominalQT)}</strong></span>
              {!isBalanced && <span>Selisih: {formatRp(Math.abs(selisih))} {selisih > 0 ? '(kurang)' : '(lebih)'}</span>}
              {isBalanced && <span>✓ Seimbang</span>}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end sticky bottom-0 bg-background pt-2 pb-1">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSubmit} loading={isSaving}
            disabled={!form.title || !form.nominal || (newTerms.length > 0 && newTerms.some(t => !t.nominal || !t.est_date))}>
            Simpan Perubahan
          </Button>
        </div>
      </div>
    </Modal>
  )
}
