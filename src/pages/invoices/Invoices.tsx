import { useState, Suspense, lazy, Component, type ReactNode } from 'react'
import { Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useAllInvoiceTerms, useInvoices, useInvoice, useGenerateInvoice,
  useNotesTemplates, useUpdateInvoiceStatus,
} from '@/hooks/useFinrok'
import {
  PageHeader, StatusBadge, Button, Input, Select, Textarea,
  EmptyState, LoadingSpinner, Amount, Modal,
} from '@/components/shared'
import { formatRp, formatDate, calcTax } from '@/lib/utils'
import type { TaxType, Invoice } from '@/types/database'
import { FileText, Eye, Download, RefreshCw, Search, CheckCircle, XCircle, SendHorizonal } from 'lucide-react'

// ── Lazy load semua PDF — JANGAN import langsung di level module ──
const LazyPDFSection = lazy(() => import('./InvoicePDFSection'))

// ── Error Boundary ─────────────────────────────────────────────
class PDFErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

export default function Invoices() {
  return (
    <Routes>
      <Route index element={<InvoiceList />} />
      <Route path="generate/:termId" element={<GenerateInvoice />} />
    </Routes>
  )
}

// ── Status action config ────────────────────────────────────────
const STATUS_ACTIONS: Record<string, { label: string; next: 'issued'|'paid'|'void'; color: string }[]> = {
  draft:   [{ label: 'Terbitkan', next: 'issued', color: 'text-blue-600' }, { label: 'Void', next: 'void', color: 'text-red-500' }],
  issued:  [{ label: 'Mark Paid', next: 'paid', color: 'text-green-600' }, { label: 'Void', next: 'void', color: 'text-red-500' }],
  overdue: [{ label: 'Mark Paid', next: 'paid', color: 'text-green-600' }, { label: 'Void', next: 'void', color: 'text-red-500' }],
  paid:    [],
  void:    [],
}

function InvoiceList() {
  const [tab, setTab]       = useState<'invoices'|'terms'>('invoices')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilter] = useState('all')
  const [previewInv, setPreview]  = useState<Invoice | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ inv: Invoice; next: string; label: string } | null>(null)
  const navigate = useNavigate()

  const { data: invoices, isLoading: loadingInv }  = useInvoices(filterStatus !== 'all' ? { status: filterStatus } : undefined)
  const { data: terms,    isLoading: loadingTerms } = useAllInvoiceTerms()
  const updateStatus = useUpdateInvoiceStatus()

  const filteredInv = invoices?.filter(inv => {
    const s = search.toLowerCase()
    return !s || inv.inv_number.toLowerCase().includes(s) || (inv.invoice_term?.quotation?.client?.name ?? '').toLowerCase().includes(s)
  }) ?? []

  const pendingTerms = terms?.filter(t => ['not_yet','need_created'].includes(t.status) && !t.invoice) ?? []

  const handleStatusChange = async () => {
    if (!confirmAction) return
    await updateStatus.mutateAsync({ id: confirmAction.inv.id, status: confirmAction.next as any })
    setConfirmAction(null)
  }

  return (
    <div className="page">
      <PageHeader title="Invoices" sub="Kelola invoice termin dan generate PDF" />
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {[{ key:'invoices', label:`Invoice Dokumen (${invoices?.length??0})` },{ key:'terms', label:`Invoice Termin Pending (${pendingTerms.length})` }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab===t.key?'border-rok-500 text-rok-600':'border-transparent text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'invoices' ? (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative max-w-xs flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-rok-400" placeholder="Cari nomor INV, client..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {(['all','draft','issued','paid','overdue','void'] as const).map(s => (
              <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus===s?'bg-rok-500 text-white':'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
                {s==='all'?'Semua':s.charAt(0).toUpperCase()+s.slice(1)}
              </button>
            ))}
          </div>
          {loadingInv ? <LoadingSpinner /> : filteredInv.length === 0 ? <EmptyState title="Belum ada invoice" description="Generate invoice dari termin yang sudah siap." /> : (
            <div className="rounded-lg border border-border overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border">
                    {['INV Number','QT Number','Client','Termin','Tgl Invoice','Due Date','Grand Total','Status','Aksi'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredInv.map((inv, i) => {
                    const qt = inv.invoice_term?.quotation; const cli = qt?.client
                    const actions = STATUS_ACTIONS[inv.status] ?? []
                    return (
                      <tr key={inv.id} className={`border-b border-border last:border-0 hover:bg-rok-50/30 ${i%2===0?'bg-white':'bg-secondary/10'}`}>
                        <td className="px-4 py-2.5 font-mono text-xs text-rok-700 font-medium whitespace-nowrap">{inv.inv_number}</td>
                        <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{qt?.qt_number??'—'}</td>
                        <td className="px-4 py-2.5 text-xs max-w-[140px] truncate">{cli?.name??'—'}</td>
                        <td className="px-4 py-2.5 text-xs max-w-[160px] truncate">{inv.invoice_term?.label??'—'}</td>
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">{formatDate(inv.inv_date)}</td>
                        <td className={`px-4 py-2.5 text-xs whitespace-nowrap ${inv.status==='overdue'?'text-red-600 font-medium':''}`}>{formatDate(inv.due_date)}</td>
                        <td className="px-4 py-2.5 text-right"><Amount value={inv.grand_total} className="text-xs" /></td>
                        <td className="px-4 py-2.5"><StatusBadge status={inv.status} type="invoice" /></td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => setPreview(inv)} className="text-[11px] text-rok-600 hover:underline font-medium flex items-center gap-1"><Eye size={11} /> Preview</button>
                            {inv.status==='draft' && <button onClick={() => navigate(`/invoices/generate/${inv.invoice_term_id}?edit=${inv.id}`)} className="text-[11px] text-amber-700 hover:underline font-medium flex items-center gap-1"><RefreshCw size={11} /> Edit</button>}
                            {actions.map(a => (
                              <button key={a.next} onClick={() => setConfirmAction({ inv, next: a.next, label: a.label })} className={`text-[11px] hover:underline font-medium flex items-center gap-1 ${a.color}`}>
                                {a.next==='issued' ? <SendHorizonal size={11} /> : a.next==='paid' ? <CheckCircle size={11} /> : <XCircle size={11} />}
                                {a.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {loadingTerms ? <LoadingSpinner /> : pendingTerms.length===0 ? <EmptyState title="Semua termin sudah digenerate" /> : (
            <div className="rounded-lg border border-border overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead><tr className="bg-secondary/40 border-b border-border">{['QT Number','Client','Label Termin','Nominal','Est. Tanggal','Status','Aksi'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {pendingTerms.map((term, i) => {
                    const qt = term.quotation; const cli = qt?.client
                    return (
                      <tr key={term.id} className={`border-b border-border last:border-0 hover:bg-rok-50/30 ${i%2===0?'bg-white':'bg-secondary/10'}`}>
                        <td className="px-4 py-2.5 font-mono text-xs text-rok-700 font-medium">{qt?.qt_number??'—'}</td>
                        <td className="px-4 py-2.5 text-xs">{cli?.name??'—'}</td>
                        <td className="px-4 py-2.5 text-xs max-w-[200px] truncate">{term.label}</td>
                        <td className="px-4 py-2.5 text-right"><Amount value={term.nominal} className="text-xs" /></td>
                        <td className={`px-4 py-2.5 text-xs whitespace-nowrap ${term.status==='need_created'?'text-amber-600 font-medium':'text-muted-foreground'}`}>{formatDate(term.est_date)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={term.status} type="term" /></td>
                        <td className="px-4 py-2.5"><Button size="sm" onClick={() => navigate(`/invoices/generate/${term.id}`)}><FileText size={12} /> Generate</Button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Preview Modal */}
      {previewInv && (
        <InvoicePreviewModal invoice={previewInv} onClose={() => setPreview(null)} />
      )}

      {/* Confirm Status Change Modal */}
      {confirmAction && (
        <Modal open title="Konfirmasi Perubahan Status" onClose={() => setConfirmAction(null)} width="max-w-sm">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {confirmAction.next === 'void'
                ? `Void invoice ${confirmAction.inv.inv_number}? Tindakan ini tidak bisa dibatalkan.`
                : `${confirmAction.label} invoice ${confirmAction.inv.inv_number}?`}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmAction(null)}>Batal</Button>
              <Button
                onClick={handleStatusChange}
                loading={updateStatus.isPending}
                className={confirmAction.next === 'void' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                {confirmAction.label}
              </Button>
            </div>
            {updateStatus.isError && <p className="text-xs text-destructive">{String(updateStatus.error)}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}

function GenerateInvoice() {
  const { termId } = useParams()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const navigate = useNavigate()
  const { data: terms } = useAllInvoiceTerms()
  const { data: notesTemplates } = useNotesTemplates()
  const generateInvoice = useGenerateInvoice()
  const term = terms?.find(t => t.id === termId)
  const qt = term?.quotation; const cli = qt?.client; const svc = qt?.service
  const [form, setForm] = useState({ inv_date: new Date().toISOString().split('T')[0], due_days: '30', tax_type: 'none' as TaxType, notes_template_id: '', custom_notes: '' })
  const [done, setDone] = useState<{ inv_number: string; grand_total: number; id: string } | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const tax = calcTax(term?.nominal ?? 0, form.tax_type)
  const dueDate = (() => { const d = new Date(form.inv_date); d.setDate(d.getDate() + parseInt(form.due_days||'0')); return d })()
  const handleGenerate = async () => {
    if (!term||!qt||!cli||!svc) return
    const result = await generateInvoice.mutateAsync({ invoice_term_id: term.id, inv_date: form.inv_date, due_days: parseInt(form.due_days), tax_type: form.tax_type, notes_template_id: form.notes_template_id||null, custom_notes: form.custom_notes||null, nominal: term.nominal, service_code: svc.code, client_code: cli.code, term_number: term.term_number, existing_invoice_id: editId??undefined })
    const inv = result as unknown as { inv_number: string; grand_total: number; id: string }
    setDone({ inv_number: inv.inv_number, grand_total: inv.grand_total, id: inv.id })
  }
  if (!term) return <LoadingSpinner />

  if (done) return (
    <div className="page max-w-xl">
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <FileText size={28} className="text-green-600" />
        </div>
        <div>
          <p className="text-lg font-bold text-green-800">{editId ? 'Invoice Diperbarui!' : 'Invoice Berhasil Dibuat!'}</p>
          <p className="text-sm text-green-700 font-mono mt-1">{done.inv_number}</p>
          <p className="text-sm text-green-700 mt-1">Grand Total: <strong>{formatRp(done.grand_total)}</strong></p>
        </div>
        <p className="text-xs text-green-600">Download PDF tersedia di halaman Invoice List → Preview.</p>
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={() => navigate('/invoices')}><FileText size={14} /> Ke Invoice List</Button>
          <Button variant="outline" onClick={() => { setDone(null); setForm({ inv_date: new Date().toISOString().split('T')[0], due_days: '30', tax_type: 'none', notes_template_id: '', custom_notes: '' }) }}>Buat Invoice Lain</Button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="page max-w-3xl">
      <PageHeader title={editId?'Edit Invoice':'Generate Invoice'} sub={`Dari: ${qt?.qt_number} — ${term.label}`} action={<Button variant="outline" onClick={() => navigate(-1)}>← Kembali</Button>} />
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          <div className="rounded-lg border border-border bg-white p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Info Termin</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Client</p><p className="font-medium">{cli?.name}</p></div>
              <div><p className="text-xs text-muted-foreground">QT Number</p><p className="font-mono text-xs">{qt?.qt_number}</p></div>
              <div className="col-span-2"><p className="text-xs text-muted-foreground">Label</p><p className="font-medium">{term.label}</p></div>
              <div><p className="text-xs text-muted-foreground">Nominal</p><p className="font-semibold num">{formatRp(term.nominal)}</p></div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-white p-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parameter Invoice</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tanggal Invoice *" type="date" value={form.inv_date} onChange={e => set('inv_date', e.target.value)} />
              <Input label="Jatuh Tempo (hari) *" type="number" min="1" value={form.due_days} onChange={e => set('due_days', e.target.value)} />
            </div>
            <Select label="Tax / PPN" value={form.tax_type} onChange={e => set('tax_type', e.target.value as TaxType)}>
              <option value="none">Tanpa PPN</option>
              <option value="ppn11">PPN 11%</option>
              <option value="ppn12">PPN 12% (DPP Nilai Lain — efektif 11%)</option>
            </Select>
            <Select label="Notes Template" value={form.notes_template_id} onChange={e => set('notes_template_id', e.target.value)}>
              <option value="">Pilih template... (opsional)</option>
              {notesTemplates?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Textarea label="Custom Notes (override template)" rows={3} placeholder="Kosongkan untuk pakai template..." value={form.custom_notes} onChange={e => set('custom_notes', e.target.value)} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-white p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ringkasan</p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Tgl Invoice</span><span className="font-medium">{formatDate(form.inv_date)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Due Date</span><span className="font-medium">{formatDate(dueDate)}</span></div>
              <div className="border-t border-border pt-2" />
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><Amount value={tax.subtotal} className="text-xs" /></div>
              {form.tax_type !== 'none' && <>
                <div className="flex justify-between"><span className="text-muted-foreground">DPP</span><Amount value={tax.taxableBase} className="text-xs" /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{form.tax_type==='ppn12'?'PPN 12% (DPP Nilai Lain)':'PPN 11%'}</span><Amount value={tax.taxAmount} className="text-xs" /></div>
              </>}
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>Grand Total</span><Amount value={tax.grandTotal} className="text-sm font-bold text-rok-700" />
              </div>
            </div>
          </div>
          <Button className="w-full" onClick={handleGenerate} loading={generateInvoice.isPending}>
            <FileText size={14} />{editId?'Update Invoice':'Generate Invoice'}
          </Button>
          {generateInvoice.isError && <p className="text-xs text-destructive text-center">{String(generateInvoice.error)}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Preview Modal — PDF hanya diload kalau user buka modal ──────
function InvoicePreviewModal({ invoice: baseInv, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { data: freshInv, isLoading, isError } = useInvoice(baseInv.id)
  const [showPDF, setShowPDF] = useState(false)

  return (
    <Modal open title={`Preview — ${baseInv.inv_number}`} onClose={onClose} width="max-w-md">
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-secondary/30 p-4 text-sm space-y-2">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Invoice Number</span><span className="font-mono font-medium text-rok-700">{baseInv.inv_number}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Status</span><StatusBadge status={baseInv.status} type="invoice" /></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Tanggal</span><span>{formatDate(baseInv.inv_date)}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Due Date</span><span>{formatDate(baseInv.due_date)}</span></div>
          <div className="flex justify-between text-xs border-t border-border pt-2"><span className="text-muted-foreground">Grand Total</span><Amount value={baseInv.grand_total} className="text-sm font-bold text-rok-700" /></div>
        </div>

        {/* PDF download — hanya render saat user klik dan data sudah siap */}
        {!showPDF && (
          <Button
            className="w-full"
            disabled={isLoading}
            loading={isLoading}
            onClick={() => setShowPDF(true)}
          >
            <Download size={14} />
            {isLoading ? 'Memuat data...' : 'Download PDF'}
          </Button>
        )}
        {showPDF && (
          <PDFErrorBoundary fallback={
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700 text-center">
              PDF renderer tidak bisa diload di browser ini.<br/>
              <span className="text-muted-foreground">Coba di browser lain atau nonaktifkan extension.</span>
            </div>
          }>
            <Suspense fallback={<Button className="w-full" disabled loading>Memuat PDF renderer...</Button>}>
              {freshInv && !isError ? (
                <LazyPDFSection invoice={freshInv} />
              ) : isError ? (
                <p className="text-xs text-destructive text-center">Gagal memuat data invoice.</p>
              ) : (
                <Button className="w-full" disabled loading>Memuat data...</Button>
              )}
            </Suspense>
          </PDFErrorBoundary>
        )}

        <Button variant="outline" className="w-full" onClick={onClose}>Tutup</Button>
      </div>
    </Modal>
  )
}
