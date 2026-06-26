import { useState, useEffect, useRef, Suspense, lazy, Component, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  useAllInvoiceTerms, useInvoices, useInvoice, useGenerateInvoice,
  useNotesTemplates, useUpdateInvoiceStatus, useUpdateInvoicePdfUrl, useMarkPaid,
} from '@/hooks/useFinrok'
import {
  PageHeader, StatusBadge, Button, Input, Select, Textarea,
  EmptyState, LoadingSpinner, Amount, Modal,
} from '@/components/shared'
import { formatRp, formatDate, calcTax, lineItemsSubtotal, resolveLineItems, errMsg } from '@/lib/utils'
import type { TaxType, Invoice, Payment, InvoiceLineItem } from '@/types/database'
import { FileText, Eye, Download, RefreshCw, Search, CheckCircle, XCircle, SendHorizonal, ArrowUpDown, ArrowUp, ArrowDown, CreditCard, Paperclip, X, MoreVertical } from 'lucide-react'
import { useCompanyStore } from '@/store/useCompanyStore'
import { supabase } from '@/lib/supabase'

// ── Lazy load semua PDF — JANGAN import langsung di level module ──
const LazyPDFSection = lazy(() => import('./InvoicePDFSection'))
const LazyReceiptSection = lazy(() => import('./ReceiptPDFSection'))

// Normalize: invoice yang menagih termin ini. Sumber utama = junction links
// (mencakup anchor + combined invoice). Fallback ke embed anchor lama (t.invoice)
// untuk data sebelum junction ada. Pilih invoice aktif (status != void) dulu.
function termInvoice(t: { invoice?: unknown; links?: { invoice: { id: string; status: string; inv_number?: string } | null }[] }): { id: string; status: string; inv_number?: string } | null {
  const fromLinks = (t.links ?? []).map(l => l.invoice).filter(Boolean) as { id: string; status: string; inv_number?: string }[]
  const active = fromLinks.find(i => i.status !== 'void')
  if (active) return active
  const inv = t.invoice
  if (inv) return Array.isArray(inv) ? ((inv[0] as any) ?? null) : (inv as any)
  return fromLinks[0] ?? null
}

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

// ── Kebab (⋮) row actions — menu di-portal ke body supaya tidak ke-clip
//    oleh overflow tabel, dan tabel tidak perlu kolom aksi yang lebar ──
function RowActions({
  inv, onPreview, onEdit, onAction,
}: {
  inv: Invoice
  onPreview: () => void
  onEdit: () => void
  onAction: (a: { label: string; next: 'issued'|'paid'|'void'; color: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const actions = STATUS_ACTIONS[inv.status] ?? []
  const canEdit = ['draft', 'issued', 'overdue'].includes(inv.status)

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
        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground ${open ? 'bg-secondary text-foreground' : ''}`}
      >
        <MoreVertical size={15} />
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 60 }}
          className="min-w-[168px] overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg"
        >
          {item('preview', <Eye size={13} />, 'Preview', 'text-rok-600', onPreview)}
          {canEdit && item('edit', <RefreshCw size={13} />, 'Edit', 'text-amber-700', onEdit)}
          {actions.map(a => item(
            a.next,
            a.next === 'issued' ? <SendHorizonal size={13} /> : a.next === 'paid' ? <CheckCircle size={13} /> : <XCircle size={13} />,
            a.label,
            a.color,
            () => onAction(a),
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

type InvoicePdfContext = {
  label: string
  term_number: number
  quotations: {
    companies: {
      name: string | null
      address: string | null
      phone: string | null
      website: string | null
      email: string | null
      logo_url: string | null
    } | null
    clients: {
      name: string | null
      address: string | null
    } | null
  } | null
}

const INVOICE_PDF_BUCKET = import.meta.env.VITE_SUPABASE_INVOICE_PDF_BUCKET || 'receipts'

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

// Trigger browser download dari blob (atau URL) — file turun ke folder Downloads user.
function triggerDownload(source: Blob | string, fileName: string) {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (typeof source !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function fetchInvoicePdfContext(invoiceTermId: string) {
  const { data, error } = await supabase
    .from('invoice_terms')
    .select(`
      label,
      term_number,
      quotations (
        companies (
          name, address, phone, website, email, logo_url
        ),
        clients (
          name, address
        )
      )
    `)
    .eq('id', invoiceTermId)
    .single()
  if (error) throw error
  return data as InvoicePdfContext
}

async function generateAndUploadInvoicePdf(invoice: Invoice) {
  let pdfModule: typeof import('@react-pdf/renderer')
  let pdfCompModule: { default: typeof import('@/components/shared/InvoicePDF').default }
  try {
    ;[pdfModule, pdfCompModule] = await Promise.all([
      import('@react-pdf/renderer'),
      import('@/components/shared/InvoicePDF'),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Failed to fetch') || msg.includes('dynamically imported')) {
      throw new Error('Versi baru telah di-deploy. Silahkan refresh halaman (Ctrl+Shift+R) lalu coba lagi.')
    }
    throw e
  }
  const { pdf } = pdfModule
  const { default: FinrokInvoicePDF } = pdfCompModule
  const ctx = await fetchInvoicePdfContext(invoice.invoice_term_id)
  const company = ctx.quotations?.companies
  const client = ctx.quotations?.clients

  const pdfData = {
    company: {
      name: company?.name ?? 'PT Roketin Kreatif Teknologi',
      address: company?.address ?? null,
      phone: company?.phone ?? null,
      website: company?.website ?? null,
      email: company?.email ?? null,
      logo_url: company?.logo_url ?? null,
    },
    inv_number: invoice.inv_number,
    inv_date: invoice.inv_date,
    due_date: invoice.due_date,
    client_name: client?.name ?? '',
    client_address: client?.address ?? null,
    term_label: ctx.label,
    term_number: ctx.term_number,
    line_items: invoice.line_items ?? null,
    subtotal: invoice.subtotal,
    tax_type: invoice.tax_type as 'none' | 'ppn11' | 'ppn12',
    taxable_base: invoice.taxable_base ?? null,
    tax_amount: invoice.tax_amount,
    grand_total: invoice.grand_total,
    notes: invoice.custom_notes || invoice.notes_template?.content || null,
  }

  const blob = await pdf(<FinrokInvoicePDF data={pdfData} />).toBlob()
  const fileName = sanitizeFileName(`${invoice.inv_number}.pdf`)
  // Path storage selalu unik (timestamp) supaya setiap upload = INSERT, bukan
  // UPDATE/overwrite. Bucket 'receipts' hanya punya policy INSERT, jadi upsert
  // file lama saat edit invoice akan kena RLS. File lama jadi orphan (acceptable).
  const filePath = `invoices/${invoice.id}/${Date.now()}_${fileName}`
  const { error: uploadError } = await supabase.storage
    .from(INVOICE_PDF_BUCKET)
    .upload(filePath, blob, { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw uploadError

  const { data: publicData } = supabase.storage.from(INVOICE_PDF_BUCKET).getPublicUrl(filePath)
  return { pdfUrl: publicData.publicUrl, blob, fileName }
}

function InvoiceList() {
  const [searchParams] = useSearchParams()
  const [tab, setTab]       = useState<'invoices'|'terms'>('invoices')
  const [search, setSearch] = useState('')
  const [termSearch, setTermSearch] = useState('')
  const [filterStatus, setFilter] = useState('all')
  const [docSortKey, setDocSortKey] = useState<'inv_number'|'client'|'term_label'|'inv_date'|'due_date'|'sent_date'|'grand_total'|'status'>('inv_date')
  const [docSortDir, setDocSortDir] = useState<'asc'|'desc'>('desc')
  const [termSortKey, setTermSortKey] = useState<'qt_number'|'client'|'label'|'nominal'|'est_date'|'status'>('est_date')
  const [termSortDir, setTermSortDir] = useState<'asc'|'desc'>('asc')
  const [previewInv, setPreview]  = useState<Invoice | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ inv: Invoice; next: string; label: string } | null>(null)
  const [payModal, setPayModal] = useState<Invoice | null>(null)
  const [payForm, setPayForm] = useState({
    pay_date: new Date().toISOString().split('T')[0],
    method: 'transfer',
    reference: '',
    bank_name: '',
    notes: '',
  })
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [sentDate, setSentDate] = useState(new Date().toISOString().split('T')[0])
  const navigate = useNavigate()
  const { selectedCompanyId } = useCompanyStore()

  const { data: invoices, isLoading: loadingInv }  = useInvoices(filterStatus !== 'all' ? { status: filterStatus, companyId: selectedCompanyId } : { companyId: selectedCompanyId })
  const { data: terms,    isLoading: loadingTerms } = useAllInvoiceTerms({ companyId: selectedCompanyId })
  const updateStatus = useUpdateInvoiceStatus()
  const markPaid = useMarkPaid()

  const filteredInv = invoices?.filter(inv => {
    const s = search.toLowerCase()
    return !s || inv.inv_number.toLowerCase().includes(s) || (inv.invoice_term?.quotation?.client?.name ?? '').toLowerCase().includes(s)
  }) ?? []

  // 'overdue' = termin yang est_date-nya lewat tapi invoice-nya belum pernah dibuat
  // (di-flag oleh refresh_overdue_status). Termin ini tetap perlu di-invoice, jadi
  // harus muncul di tab Pending — bukan hilang dari mana-mana.
  const pendingTerms = terms?.filter(t => ['not_yet', 'need_created', 'overdue'].includes(t.status) && (!termInvoice(t) || termInvoice(t)?.status === 'void')) ?? []
  const filteredTerms = pendingTerms.filter(term => {
    const s = termSearch.toLowerCase()
    const qtNumber = term.quotation?.qt_number ?? ''
    const clientName = term.quotation?.client?.name ?? ''
    return !s || qtNumber.toLowerCase().includes(s) || clientName.toLowerCase().includes(s) || term.label.toLowerCase().includes(s)
  })

  const toggleDocSort = (key: typeof docSortKey) => {
    if (docSortKey === key) setDocSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setDocSortKey(key); setDocSortDir('asc') }
  }
  const toggleTermSort = (key: typeof termSortKey) => {
    if (termSortKey === key) setTermSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setTermSortKey(key); setTermSortDir('asc') }
  }

  const DocSortIcon = ({ keyName }: { keyName: typeof docSortKey }) => {
    if (docSortKey !== keyName) return <ArrowUpDown size={12} className="text-muted-foreground" />
    return docSortDir === 'asc'
      ? <ArrowUp size={12} className="text-rok-600" />
      : <ArrowDown size={12} className="text-rok-600" />
  }
  const TermSortIcon = ({ keyName }: { keyName: typeof termSortKey }) => {
    if (termSortKey !== keyName) return <ArrowUpDown size={12} className="text-muted-foreground" />
    return termSortDir === 'asc'
      ? <ArrowUp size={12} className="text-rok-600" />
      : <ArrowDown size={12} className="text-rok-600" />
  }

  const sortedInv = [...filteredInv].sort((a, b) => {
    const factor = docSortDir === 'asc' ? 1 : -1
    const clientA = a.invoice_term?.quotation?.client?.name ?? ''
    const clientB = b.invoice_term?.quotation?.client?.name ?? ''
    // Samakan dengan teks kolom "Termin": prefer deskripsi item, fallback label termin.
    const terminLabel = (inv: Invoice) =>
      (inv.line_items ?? []).map(it => it.description?.trim()).filter(Boolean).join(' · ')
      || inv.invoice_term?.label || ''
    const labelA = terminLabel(a)
    const labelB = terminLabel(b)
    switch (docSortKey) {
      case 'inv_number': return factor * a.inv_number.localeCompare(b.inv_number)
      case 'client': return factor * clientA.localeCompare(clientB)
      case 'term_label': return factor * labelA.localeCompare(labelB)
      case 'inv_date': return factor * (new Date(a.inv_date).getTime() - new Date(b.inv_date).getTime())
      case 'due_date': return factor * (new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      case 'sent_date': return factor * ((a.issued_at ? new Date(a.issued_at).getTime() : 0) - (b.issued_at ? new Date(b.issued_at).getTime() : 0))
      case 'grand_total': return factor * (a.grand_total - b.grand_total)
      case 'status': return factor * a.status.localeCompare(b.status)
    }
  })

  const sortedTerms = [...filteredTerms].sort((a, b) => {
    const factor = termSortDir === 'asc' ? 1 : -1
    const qtA = a.quotation?.qt_number ?? ''
    const qtB = b.quotation?.qt_number ?? ''
    const clientA = a.quotation?.client?.name ?? ''
    const clientB = b.quotation?.client?.name ?? ''
    switch (termSortKey) {
      case 'qt_number': return factor * qtA.localeCompare(qtB)
      case 'client': return factor * clientA.localeCompare(clientB)
      case 'label': return factor * a.label.localeCompare(b.label)
      case 'nominal': return factor * (a.nominal - b.nominal)
      case 'est_date': return factor * (new Date(a.est_date).getTime() - new Date(b.est_date).getTime())
      case 'status': return factor * a.status.localeCompare(b.status)
    }
  })

  const runRowAction = (inv: Invoice, a: { label: string; next: 'issued'|'paid'|'void' }) => {
    if (a.next === 'paid') {
      setUploadError('')
      setReceiptFile(null)
      if (fileRef.current) fileRef.current.value = ''
      setPayForm({ pay_date: new Date().toISOString().split('T')[0], method: 'transfer', reference: '', bank_name: '', notes: '' })
      setPayModal(inv)
      return
    }
    if (a.next === 'issued') setSentDate(new Date().toISOString().split('T')[0])
    setConfirmAction({ inv, next: a.next, label: a.label })
  }

  const handleStatusChange = async () => {
    if (!confirmAction) return
    await updateStatus.mutateAsync({
      id: confirmAction.inv.id,
      status: confirmAction.next as any,
      sent_date: confirmAction.next === 'issued' ? sentDate : undefined,
    })
    setConfirmAction(null)
  }

  const setPay = (k: string, v: string) => setPayForm(f => ({ ...f, [k]: v }))
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setUploadError('')
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setUploadError('Ukuran file maks 2MB'); return }
    const allowed = ['image/jpeg','image/png','image/jpg','application/pdf']
    if (!allowed.includes(file.type)) { setUploadError('Format: JPG, PNG, atau PDF'); return }
    setReceiptFile(file)
  }
  const handlePay = async () => {
    if (!payModal) return
    setUploading(true)
    let receipt_url: string | undefined
    try {
      if (receiptFile) {
        const ext = receiptFile.name.split('.').pop()
        const path = `receipts/${payModal.id}_${Date.now()}.${ext}`
        const { data: up, error: upErr } = await supabase.storage.from('receipts').upload(path, receiptFile, { upsert: true })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(up.path)
        receipt_url = urlData.publicUrl
      }
      await markPaid.mutateAsync({
        invoice_id: payModal.id,
        pay_date: payForm.pay_date,
        amount: payModal.grand_total,
        method: payForm.method,
        reference: payForm.reference || undefined,
        bank_name: payForm.bank_name || undefined,
        notes: payForm.notes || undefined,
        receipt_url,
      })
      setPayModal(null)
      setReceiptFile(null)
      setPayForm({ pay_date: new Date().toISOString().split('T')[0], method: 'transfer', reference: '', bank_name: '', notes: '' })
    } catch (err: any) {
      setUploadError(err.message ?? 'Upload gagal')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    const invoiceId = searchParams.get('invoice')
    if (!invoiceId || !invoices?.length) return
    const target = invoices.find(inv => inv.id === invoiceId)
    if (target) setPreview(target)
  }, [searchParams, invoices])

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
          {loadingInv ? <LoadingSpinner /> : sortedInv.length === 0 ? <EmptyState title="Belum ada invoice" description="Generate invoice dari termin yang sudah siap." /> : (
            <div className="rounded-lg border border-border bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border">
                      {(['INV Number','Client','Termin','Tgl Invoice','Due Date','Sent Date','Grand Total','Status','Aksi'] as const).map((h, idx, arr) => (
                        <th
                          key={h}
                          className={`px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap ${
                            h === 'INV Number' ? 'min-w-[196px] ' : ''
                          }${
                            h === 'Client' ? 'min-w-[140px] ' : ''
                          }${
                            h === 'Termin' ? 'w-full min-w-[280px] ' : ''
                          }${
                            h === 'Tgl Invoice' || h === 'Due Date' || h === 'Sent Date' ? 'min-w-[88px] ' : ''
                          }${
                            h === 'Grand Total' ? 'min-w-[118px] ' : ''
                          }${
                            h === 'Status' ? 'min-w-[96px] ' : ''
                          }${
                            idx === arr.length - 1
                              ? 'sticky right-0 z-20 w-[48px] min-w-[48px] text-center bg-white border-l border-border shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.12)]'
                              : ''
                          } ${idx !== arr.length - 1 ? 'cursor-pointer select-none' : ''}`}
                          onClick={idx === arr.length - 1 ? undefined : () => {
                            const keyMap = {
                              'INV Number': 'inv_number',
                              Client: 'client',
                              Termin: 'term_label',
                              'Tgl Invoice': 'inv_date',
                              'Due Date': 'due_date',
                              'Sent Date': 'sent_date',
                              'Grand Total': 'grand_total',
                              Status: 'status',
                            } as const
                            const sortKey = keyMap[h as keyof typeof keyMap]
                            if (sortKey) toggleDocSort(sortKey)
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {h}
                            {idx !== arr.length - 1 && (
                              <DocSortIcon keyName={{
                                'INV Number': 'inv_number',
                                Client: 'client',
                                Termin: 'term_label',
                                'Tgl Invoice': 'inv_date',
                                'Due Date': 'due_date',
                                'Sent Date': 'sent_date',
                                'Grand Total': 'grand_total',
                                Status: 'status',
                              }[h as 'INV Number'|'Client'|'Termin'|'Tgl Invoice'|'Due Date'|'Sent Date'|'Grand Total'|'Status']} />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedInv.map((inv, i) => {
                      const qt = inv.invoice_term?.quotation; const cli = qt?.client
                      const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-secondary/10'
                      // Tampilkan deskripsi item invoice (yang bisa diedit user), fallback ke label termin.
                      const lineDesc = (inv.line_items ?? [])
                        .map(it => it.description?.trim())
                        .filter(Boolean)
                        .join(' · ')
                      const terminText = lineDesc || inv.invoice_term?.label || '—'
                      return (
                        <tr key={inv.id} className={`group border-b border-border last:border-0 hover:bg-rok-50/30 ${rowBg}`}>
                          <td className="px-3 py-2.5 font-mono text-xs text-rok-700 font-medium min-w-[196px] max-w-[196px] truncate" title={inv.inv_number}>{inv.inv_number}</td>
                          <td className="px-3 py-2.5 text-xs min-w-[140px] max-w-[140px] truncate" title={cli?.name ?? undefined}>{cli?.name ?? '—'}</td>
                          <td className="px-3 py-2.5 text-xs w-full min-w-[280px] max-w-[420px] truncate" title={terminText}>{terminText}</td>
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap min-w-[88px]">{formatDate(inv.inv_date)}</td>
                          <td className={`px-3 py-2.5 text-xs whitespace-nowrap min-w-[88px] ${inv.status==='overdue'?'text-red-600 font-medium':''}`}>{formatDate(inv.due_date)}</td>
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap min-w-[88px]">{inv.issued_at ? formatDate(inv.issued_at) : '—'}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap min-w-[118px]"><Amount value={inv.grand_total} className="text-xs" /></td>
                          <td className="px-3 py-2.5 whitespace-nowrap min-w-[96px]"><StatusBadge status={inv.status} type="invoice" /></td>
                          <td className={`px-2 py-2.5 sticky right-0 z-10 w-[48px] min-w-[48px] border-l border-border shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.08)] ${rowBg} group-hover:bg-rok-50/30`}>
                            <RowActions
                              inv={inv}
                              onPreview={() => setPreview(inv)}
                              onEdit={() => navigate(`/invoices/generate/${inv.invoice_term_id}?edit=${inv.id}`)}
                              onAction={a => runRowAction(inv, a)}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative max-w-xs flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-rok-400"
                placeholder="Cari QT number, client, atau label termin..."
                value={termSearch}
                onChange={e => setTermSearch(e.target.value)}
              />
            </div>
          </div>
          {loadingTerms ? <LoadingSpinner /> : sortedTerms.length===0 ? <EmptyState title="Semua termin sudah digenerate" /> : (
            <div className="rounded-lg border border-border bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border">
                      {(['QT Number','Client','Label Termin','Nominal','Est. Tanggal','Status','Aksi'] as const).map((h, idx, arr) => (
                        <th
                          key={h}
                          className={`px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap ${
                            h === 'QT Number' ? 'min-w-[210px] ' : ''
                          }${
                            h === 'Client' ? 'min-w-[170px] ' : ''
                          }${
                            h === 'Label Termin' ? 'min-w-[220px] ' : ''
                          }${
                            h === 'Nominal' ? 'min-w-[140px] ' : ''
                          }${
                            h === 'Est. Tanggal' ? 'min-w-[120px] ' : ''
                          }${
                            h === 'Status' ? 'min-w-[120px] ' : ''
                          }${
                            idx === arr.length - 1
                              ? 'sticky right-0 z-20 min-w-[140px] bg-white border-l border-border shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.12)]'
                              : ''
                          } ${idx !== arr.length - 1 ? 'cursor-pointer select-none' : ''}`}
                          onClick={idx === arr.length - 1 ? undefined : () => {
                            const keyMap = {
                              'QT Number': 'qt_number',
                              Client: 'client',
                              'Label Termin': 'label',
                              Nominal: 'nominal',
                              'Est. Tanggal': 'est_date',
                              Status: 'status',
                            } as const
                            const sortKey = keyMap[h as keyof typeof keyMap]
                            if (sortKey) toggleTermSort(sortKey)
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {h}
                            {idx !== arr.length - 1 && (
                              <TermSortIcon keyName={{
                                'QT Number': 'qt_number',
                                Client: 'client',
                                'Label Termin': 'label',
                                Nominal: 'nominal',
                                'Est. Tanggal': 'est_date',
                                Status: 'status',
                              }[h as 'QT Number'|'Client'|'Label Termin'|'Nominal'|'Est. Tanggal'|'Status']} />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTerms.map((term, i) => {
                      const qt = term.quotation; const cli = qt?.client
                      const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-secondary/10'
                      return (
                        <tr key={term.id} className={`group border-b border-border last:border-0 hover:bg-rok-50/30 ${rowBg}`}>
                          <td className="px-4 py-2.5 font-mono text-xs text-rok-700 font-medium min-w-[210px] max-w-[210px] truncate" title={qt?.qt_number ?? undefined}>{qt?.qt_number ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs min-w-[170px] max-w-[170px] truncate" title={cli?.name ?? undefined}>{cli?.name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs min-w-[220px] max-w-[220px] truncate" title={term.label}>{term.label}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap min-w-[140px]"><Amount value={term.nominal} className="text-xs" /></td>
                          <td className={`px-4 py-2.5 text-xs whitespace-nowrap min-w-[120px] ${term.status==='overdue'?'text-red-600 font-medium':term.status==='need_created'?'text-amber-600 font-medium':'text-muted-foreground'}`}>{formatDate(term.est_date)}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap min-w-[120px]"><StatusBadge status={term.status} type="term" /></td>
                          <td className="px-4 py-2.5 sticky right-0 z-10 min-w-[140px] border-l border-border bg-white shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.08)] group-hover:bg-white whitespace-nowrap">
                            <Button size="sm" onClick={() => navigate(`/invoices/generate/${term.id}`)}><FileText size={12} /> Generate</Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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
            {confirmAction.next === 'issued' && (
              <Input
                label="Sent Date *"
                type="date"
                value={sentDate}
                onChange={e => setSentDate(e.target.value)}
              />
            )}
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

      {payModal && (
        <Modal open title={`Konfirmasi Pembayaran — ${payModal.inv_number}`} onClose={() => { setPayModal(null); setReceiptFile(null) }} width="max-w-md">
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-md p-3 flex justify-between text-sm">
              <span className="text-green-700">Grand Total</span>
              <Amount value={payModal.grand_total} className="font-bold text-green-700" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tanggal Bayar *" type="date" value={payForm.pay_date} onChange={e => setPay('pay_date', e.target.value)} />
              <Select label="Metode" value={payForm.method} onChange={e => setPay('method', e.target.value)}>
                <option value="transfer">Transfer Bank</option>
                <option value="cash">Cash</option>
                <option value="giro">Giro</option>
                <option value="other">Lainnya</option>
              </Select>
            </div>
            <Input label="Nomor Referensi / Bukti Transfer" placeholder="REF/TRF/..." value={payForm.reference} onChange={e => setPay('reference', e.target.value)} />
            <Input label="Bank Pengirim" placeholder="BCA, Mandiri..." value={payForm.bank_name} onChange={e => setPay('bank_name', e.target.value)} />
            <Input label="Catatan (opsional)" value={payForm.notes} onChange={e => setPay('notes', e.target.value)} />
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Bukti Transfer (opsional) — JPG, PNG, atau PDF, maks 2MB</label>
              {!receiptFile ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-4 text-xs text-muted-foreground hover:border-rok-400 hover:text-rok-600 transition-colors flex flex-col items-center gap-1"
                >
                  <Paperclip size={16} />
                  <span>Klik untuk upload bukti transfer</span>
                </button>
              ) : (
                <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2 text-xs">
                  <span className="truncate text-slate-700 font-medium">{receiptFile.name}</span>
                  <button onClick={() => { setReceiptFile(null); if (fileRef.current) fileRef.current.value = '' }} className="text-muted-foreground hover:text-destructive ml-2">
                    <X size={13} />
                  </button>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={handleFileChange} />
              {uploadError && <p className="text-xs text-destructive mt-1">{uploadError}</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setPayModal(null); setReceiptFile(null) }}>Batal</Button>
              <Button onClick={handlePay} loading={uploading || markPaid.isPending} disabled={!payForm.pay_date}>
                <CreditCard size={13} /> Konfirmasi Lunas
              </Button>
            </div>
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
  const { selectedCompanyId } = useCompanyStore()
  const { data: terms } = useAllInvoiceTerms({ companyId: selectedCompanyId })
  const { data: notesTemplates } = useNotesTemplates()
  const generateInvoice = useGenerateInvoice()
  const updateInvoicePdfUrl = useUpdateInvoicePdfUrl()
  const { data: editingInv } = useInvoice(editId ?? undefined)
  const term = terms?.find(t => t.id === termId)
  const qt = term?.quotation; const cli = qt?.client; const svc = qt?.service
  const [form, setForm] = useState({ inv_date: new Date().toISOString().split('T')[0], due_days: '30', tax_type: 'none' as TaxType, notes_template_id: '', custom_notes: '', line_items: [] as InvoiceLineItem[] })
  const [done, setDone] = useState<{ inv_number: string; grand_total: number; id: string } | null>(null)
  const [pdfErr, setPdfErr] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setLine = (i: number, k: keyof InvoiceLineItem, v: string) => setForm(f => ({
    ...f,
    line_items: f.line_items.map((it, idx) => idx !== i ? it : { ...it, [k]: k === 'description' ? v : (Number(v) || 0) }),
  }))
  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { description: '', qty: 1, unit_price: 0 }] }))
  const removeLine = (i: number) => setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }))
  const subtotal = lineItemsSubtotal(form.line_items)
  const tax = calcTax(subtotal, form.tax_type)
  const dueDate = (() => { const d = new Date(form.inv_date); d.setDate(d.getDate() + parseInt(form.due_days||'0')); return d })()

  // ── Member termin: 1 invoice bisa menagih termin dari beberapa quotation ──
  // anchor = termId; tambahan dipilih dari termin pending client yang sama.
  const [memberTermIds, setMemberTermIds] = useState<string[]>([])
  const termById = new Map<string, any>()
  ;(terms ?? []).forEach(t => termById.set(t.id, t))
  ;(editingInv?.member_terms ?? []).forEach(t => termById.set(t.id, t))
  if (term) termById.set(term.id, term)
  const memberTerms = memberTermIds.map(id => termById.get(id)).filter(Boolean)
  const membersNominalTotal = memberTerms.reduce((s, t) => s + (t?.nominal || 0), 0)
  // Termin lain yang bisa digabung: client sama, belum jadi member, masih pending.
  const availableTerms = (terms ?? []).filter(t =>
    t.quotation?.client_id === cli?.id &&
    !memberTermIds.includes(t.id) &&
    ['not_yet', 'need_created', 'overdue'].includes(t.status) &&
    (!termInvoice(t) || termInvoice(t)?.status === 'void'),
  )
  const addMember = (t: any) => {
    setMemberTermIds(ids => ids.includes(t.id) ? ids : [...ids, t.id])
    setForm(f => ({ ...f, line_items: [...f.line_items, { description: t.label, qty: 1, unit_price: t.nominal ?? 0 }] }))
  }
  const removeMember = (id: string) => setMemberTermIds(ids => ids.filter(x => x !== id))

  // Prefill: saat edit isi dari invoice lama, saat create isi default + infer PPN dari notes QT.
  useEffect(() => {
    if (initialized) return
    if (editId) {
      if (!editingInv) return
      const days = Math.max(0, Math.round(
        (new Date(editingInv.due_date).getTime() - new Date(editingInv.inv_date).getTime()) / 86400000,
      ))
      setForm({
        inv_date:          editingInv.inv_date,
        due_days:          String(days),
        tax_type:          editingInv.tax_type as TaxType,
        notes_template_id: editingInv.notes_template_id ?? '',
        custom_notes:      editingInv.custom_notes ?? '',
        line_items:        resolveLineItems({
          line_items: editingInv.line_items,
          term_label: editingInv.invoice_term?.label,
          subtotal:   editingInv.subtotal,
        }),
      })
      const memberIds = (editingInv.member_terms ?? []).map(t => t.id)
      setMemberTermIds(memberIds.length > 0 ? memberIds : [editingInv.invoice_term_id])
      setInitialized(true)
    } else {
      if (!term) return
      const qNotes = term.quotation?.notes?.toLowerCase?.() ?? ''
      const inferredTax: TaxType = qNotes.includes('tax: ppn 11%') ? 'ppn11' : 'none'
      setForm(f => ({ ...f, tax_type: inferredTax, line_items: [{ description: term.label, qty: 1, unit_price: term.nominal ?? 0 }] }))
      setMemberTermIds([term.id])
      setInitialized(true)
    }
  }, [editId, editingInv, term, initialized])
  const handleGenerate = async () => {
    if (!term||!qt||!cli||!svc) return
    setPdfErr(null)

    // Auto-detect voided invoice untuk re-generate
    // (pakai existing_invoice_id supaya UPDATE bukan INSERT, hindari 409 conflict)
    const existingInv = termInvoice(term)
    const voidedInvoiceId = existingInv?.status === 'void' ? existingInv.id : undefined

    const invoice = await generateInvoice.mutateAsync({
      invoice_term_id:    term.id,
      inv_date:           form.inv_date,
      due_days:           parseInt(form.due_days),
      tax_type:           form.tax_type,
      notes_template_id:  form.notes_template_id || null,
      custom_notes:       form.custom_notes || null,
      line_items:         form.line_items,
      service_code:       svc.code,
      client_code:        cli.code,
      term_number:        term.term_number,
      member_term_ids:    memberTermIds.length > 0 ? memberTermIds : [term.id],
      existing_invoice_id: editId ?? voidedInvoiceId,
    }) as Invoice

    try {
      const { pdfUrl, blob, fileName } = await generateAndUploadInvoicePdf(invoice)
      await updateInvoicePdfUrl.mutateAsync({ id: invoice.id, pdf_url: pdfUrl })
      // Langsung download PDF ke mesin user (dipicu dari klik tombol → tetap user-gesture).
      triggerDownload(blob, fileName)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setPdfErr(`Invoice sudah dibuat, tapi gagal simpan PDF otomatis: ${msg}`)
      return
    }

    setDone({ inv_number: invoice.inv_number, grand_total: invoice.grand_total, id: invoice.id })
  }
  if (!term) return <LoadingSpinner />

  // Termin (anchor) hanya boleh punya 1 invoice — UNIQUE constraint di invoice_term_id.
  // Kalau sudah ada invoice non-void & ini bukan mode edit, jangan biarkan INSERT (409).
  // Arahkan user ke Edit invoice yang sudah ada.
  const existingActiveInv = !editId ? termInvoice(term) : null
  if (existingActiveInv && existingActiveInv.status !== 'void') return (
    <div className="page max-w-xl">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <FileText size={28} className="text-amber-600" />
        </div>
        <div>
          <p className="text-lg font-bold text-amber-800">Invoice untuk termin ini sudah ada</p>
          <p className="text-sm text-amber-700 font-mono mt-1">{existingActiveInv.inv_number}</p>
          <p className="text-sm text-amber-700 mt-1">Termin: <strong>{term.label}</strong></p>
        </div>
        <p className="text-xs text-amber-600">Satu termin hanya bisa punya satu invoice. Edit invoice yang ada, atau void dulu jika ingin generate ulang.</p>
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={() => navigate(`/invoices/generate/${term.id}?edit=${existingActiveInv.id}`)}><FileText size={14} /> Edit Invoice</Button>
          <Button variant="outline" onClick={() => navigate('/invoices')}>Ke Invoice List</Button>
        </div>
      </div>
    </div>
  )

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
        <p className="text-xs text-green-600">PDF otomatis ter-download & tersimpan. Status invoice: Issued.</p>
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={() => navigate('/invoices')}><FileText size={14} /> Ke Invoice List</Button>
          {!editId && <Button variant="outline" onClick={() => { setDone(null); setInitialized(false); setForm({ inv_date: new Date().toISOString().split('T')[0], due_days: '30', tax_type: 'none', notes_template_id: '', custom_notes: '', line_items: [] }) }}>Buat Invoice Lain</Button>}
        </div>
      </div>
    </div>
  )

  const isRegenerate = !editId && termInvoice(term ?? {})?.status === 'void'

  return (
    <div className="page">
      <PageHeader
        title={editId ? 'Edit Invoice' : isRegenerate ? 'Re-generate Invoice' : 'Generate Invoice'}
        sub={`Dari: ${qt?.qt_number} — ${term.label}`}
        action={<Button variant="outline" onClick={() => navigate(-1)}>← Kembali</Button>}
      />
      {isRegenerate && (
        <div className="mb-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span>⚠️</span>
          <span>Invoice sebelumnya sudah di-void. Generate ini akan <strong>menggantikan</strong> invoice lama dengan nomor invoice baru.</span>
        </div>
      )}
      {editId && editingInv && editingInv.status !== 'draft' && (
        <div className="mb-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span>⚠️</span>
          <span>Invoice sudah diterbitkan (<strong>{editingInv.inv_number}</strong>). Perubahan akan regenerate PDF, <strong>nomor invoice tetap sama</strong>, dan tercatat di log audit.</span>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div className="space-y-4 min-w-0">
          <div className="rounded-lg border border-border bg-white p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Info Termin</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Client</p><p className="font-medium">{cli?.name}</p></div>
              <div><p className="text-xs text-muted-foreground">QT Number</p><p className="font-mono text-xs">{qt?.qt_number}</p></div>
              <div><p className="text-xs text-muted-foreground">Judul QT</p><p className="font-medium">{qt?.title ?? '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Nominal</p><p className="font-semibold num">{formatRp(term.nominal)}</p></div>
              <div className="col-span-2 lg:col-span-4"><p className="text-xs text-muted-foreground">Label</p><p className="font-medium">{term.label}</p></div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-white p-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parameter Invoice</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tanggal Invoice *" type="date" value={form.inv_date} onChange={e => set('inv_date', e.target.value)} />
              <Input label="Jatuh Tempo (hari) *" type="number" min="1" value={form.due_days} onChange={e => set('due_days', e.target.value)} />
            </div>

            {/* Termin yang ditagih — 1 invoice bisa gabung termin dari quotation lain (client sama) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Termin yang ditagih</span>
                {memberTerms.length > 1 && (
                  <span className="text-[11px] text-muted-foreground">{memberTerms.length} termin · total {formatRp(membersNominalTotal)}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {memberTerms.map((mt, idx) => (
                  <span key={mt.id} className="inline-flex items-center gap-1.5 max-w-full rounded-full border border-rok-200 bg-rok-50 pl-2.5 pr-1.5 py-1 text-[11px] text-rok-800">
                    <span className="truncate max-w-[260px]">
                      {mt.quotation?.qt_number ? `${mt.quotation.qt_number} · ` : ''}{mt.label}
                      <span className="text-rok-500"> — {formatRp(mt.nominal)}</span>
                    </span>
                    {idx === 0 ? (
                      <span className="text-[9px] uppercase tracking-wide text-rok-400 px-1">anchor</span>
                    ) : (
                      <button type="button" onClick={() => removeMember(mt.id)} className="text-rok-400 hover:text-destructive transition-colors" title="Lepas termin">
                        <X size={13} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {availableTerms.length > 0 ? (
                <Select
                  value=""
                  onChange={e => { const t = availableTerms.find(x => x.id === e.target.value); if (t) addMember(t) }}
                >
                  <option value="">+ Tambah termin dari quotation lain...</option>
                  {availableTerms.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.quotation?.qt_number} · {t.label} — {formatRp(t.nominal)}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-[11px] text-muted-foreground">Tidak ada termin pending lain untuk client ini.</p>
              )}
              <p className="text-[11px] text-muted-foreground">Saat invoice dibayar, semua termin di atas otomatis ditandai lunas.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Item Invoice <span className="text-muted-foreground font-normal">(sebelum PPN)</span> *</span>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-[11px] px-2 py-1 rounded border border-rok-300 bg-rok-50 text-rok-700 hover:bg-rok-100 font-medium transition-colors"
                >
                  + Tambah baris
                </button>
              </div>
              <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_72px_160px_160px_28px] gap-2 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>Deskripsi</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Harga Satuan</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              {form.line_items.map((it, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_72px_160px_160px_28px] gap-2 items-center">
                  <input
                    className="w-full px-2.5 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-rok-400"
                    placeholder="Deskripsi item"
                    value={it.description}
                    onChange={e => setLine(i, 'description', e.target.value)}
                  />
                  <input
                    type="number" min="0"
                    className="w-full px-2 py-2 text-sm text-center border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-rok-400"
                    value={it.qty === 0 ? '' : it.qty}
                    onChange={e => setLine(i, 'qty', e.target.value)}
                  />
                  <input
                    type="number" min="0"
                    className="w-full px-2.5 py-2 text-sm text-right border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-rok-400"
                    placeholder="0"
                    value={it.unit_price === 0 ? '' : it.unit_price}
                    onChange={e => setLine(i, 'unit_price', e.target.value)}
                  />
                  <span className="text-xs text-right num tabular-nums text-muted-foreground">
                    {formatRp(Math.round((it.qty || 0) * (it.unit_price || 0)))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    disabled={form.line_items.length <= 1}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors flex items-center justify-center"
                    title="Hapus baris"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 px-1">
                <span className="text-xs text-muted-foreground">Subtotal</span>
                <span className="text-sm font-semibold num">{formatRp(subtotal)}</span>
              </div>
              {(() => {
                const expected = memberTerms.length > 1 ? membersNominalTotal : (term?.nominal ?? 0)
                return Math.abs(subtotal - expected) >= 1 ? (
                  <p className="text-[11px] text-amber-600">
                    Subtotal berbeda dari total nominal termin ({formatRp(expected)}).
                  </p>
                ) : null
              })()}
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
        <div className="space-y-4 lg:sticky lg:top-6">
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
          <Button className="w-full" onClick={handleGenerate} loading={generateInvoice.isPending || updateInvoicePdfUrl.isPending}>
            <FileText size={14} />{editId?'Update Invoice':'Generate Invoice'}
          </Button>
          {generateInvoice.isError && <p className="text-xs text-destructive text-center">{errMsg(generateInvoice.error, 'Gagal generate invoice.')}</p>}
          {pdfErr && <p className="text-xs text-destructive text-center">{pdfErr}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Preview Modal — PDF hanya diload kalau user buka modal ──────
function InvoicePreviewModal({ invoice: baseInv, onClose }: { invoice: Invoice; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: freshInv, isLoading, isError } = useInvoice(baseInv.id)
  const [showPDF, setShowPDF] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const canEdit = ['draft', 'issued', 'overdue'].includes(baseInv.status)

  // Download cepat: ambil PDF tersimpan langsung (tanpa render ulang react-pdf).
  // Fallback ke render client-side kalau pdf_url kosong / gagal di-fetch.
  const handleDownload = async () => {
    const url = freshInv?.pdf_url ?? baseInv.pdf_url
    if (!url) { setShowPDF(true); return }
    setDownloading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(String(res.status))
      triggerDownload(await res.blob(), `${baseInv.inv_number}.pdf`)
    } catch {
      setShowPDF(true)
    } finally {
      setDownloading(false)
    }
  }
  const { data: latestPayment } = useQuery({
    queryKey: ['latest-payment', baseInv.id],
    enabled: baseInv.status === 'paid',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', baseInv.id)
        .order('pay_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Payment | null
    },
  })

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

        {baseInv.status === 'paid' && latestPayment && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-xs space-y-1.5">
            <div className="flex justify-between"><span className="text-muted-foreground">Tanggal Bayar</span><span className="font-medium">{formatDate(latestPayment.pay_date)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Metode</span><span className="font-medium">{latestPayment.method}</span></div>
            {latestPayment.reference && <div className="flex justify-between"><span className="text-muted-foreground">Referensi</span><span className="font-medium">{latestPayment.reference}</span></div>}
            {latestPayment.bank_name && <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">{latestPayment.bank_name}</span></div>}
            {latestPayment.notes && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Catatan</span><span className="font-medium text-right">{latestPayment.notes}</span></div>}
            {latestPayment.receipt_url && (
              <a href={latestPayment.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-rok-600 hover:underline font-medium">
                Lihat File Upload
              </a>
            )}
          </div>
        )}

        {/* PDF download — pakai file tersimpan; fallback render client-side bila perlu */}
        {!showPDF && (
          <Button
            className="w-full"
            disabled={isLoading || downloading}
            loading={isLoading || downloading}
            onClick={handleDownload}
          >
            <Download size={14} />
            {isLoading ? 'Memuat data...' : downloading ? 'Menyiapkan PDF...' : 'Download PDF'}
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

        {baseInv.status === 'paid' && latestPayment && !showReceipt && (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setShowReceipt(true)}
          >
            <Download size={14} />
            Download Receipt
          </Button>
        )}
        {showReceipt && freshInv && latestPayment && (
          <PDFErrorBoundary fallback={
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700 text-center">
              Receipt renderer tidak bisa diload di browser ini.
            </div>
          }>
            <Suspense fallback={<Button className="w-full" disabled loading>Memuat Receipt renderer...</Button>}>
              <LazyReceiptSection invoice={freshInv} payment={latestPayment} />
            </Suspense>
          </PDFErrorBoundary>
        )}

        {canEdit && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate(`/invoices/generate/${baseInv.invoice_term_id}?edit=${baseInv.id}`)}
          >
            <RefreshCw size={14} /> Edit Invoice
          </Button>
        )}
        <Button variant="outline" className="w-full" onClick={onClose}>Tutup</Button>
      </div>
    </Modal>
  )
}
