import { useState, useEffect, useRef, Suspense, lazy, Component, type ReactNode } from 'react'
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
import { formatRp, formatDate, calcTax } from '@/lib/utils'
import type { TaxType, Invoice, Payment } from '@/types/database'
import { FileText, Eye, Download, RefreshCw, Search, CheckCircle, XCircle, SendHorizonal, ArrowUpDown, ArrowUp, ArrowDown, CreditCard, Paperclip, X } from 'lucide-react'
import { useCompanyStore } from '@/store/useCompanyStore'
import { supabase } from '@/lib/supabase'

// ── Lazy load semua PDF — JANGAN import langsung di level module ──
const LazyPDFSection = lazy(() => import('./InvoicePDFSection'))
const LazyReceiptSection = lazy(() => import('./ReceiptPDFSection'))

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
  const [{ pdf }, { default: FinrokInvoicePDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/shared/InvoicePDF'),
  ])
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
    subtotal: invoice.subtotal,
    tax_type: invoice.tax_type as 'none' | 'ppn11' | 'ppn12',
    taxable_base: invoice.taxable_base ?? null,
    tax_amount: invoice.tax_amount,
    grand_total: invoice.grand_total,
    notes: invoice.custom_notes ?? null,
  }

  const blob = await pdf(<FinrokInvoicePDF data={pdfData} />).toBlob()
  const fileName = sanitizeFileName(`${invoice.inv_number}.pdf`)
  const filePath = `invoices/${invoice.id}/${fileName}`
  const { error: uploadError } = await supabase.storage
    .from(INVOICE_PDF_BUCKET)
    .upload(filePath, blob, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw uploadError

  const { data: publicData } = supabase.storage.from(INVOICE_PDF_BUCKET).getPublicUrl(filePath)
  return publicData.publicUrl
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

  const pendingTerms = terms?.filter(t => ['not_yet', 'need_created'].includes(t.status) && (!t.invoice || (t.invoice as any).status === 'void')) ?? []
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
    const labelA = a.invoice_term?.label ?? ''
    const labelB = b.invoice_term?.label ?? ''
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
                <table className="w-full min-w-[1180px] text-sm">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border">
                      {(['INV Number','Client','Termin','Tgl Invoice','Due Date','Sent Date','Grand Total','Status','Aksi'] as const).map((h, idx, arr) => (
                        <th
                          key={h}
                          className={`px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap ${
                            h === 'INV Number' ? 'min-w-[220px] ' : ''
                          }${
                            h === 'Client' ? 'min-w-[170px] ' : ''
                          }${
                            h === 'Termin' ? 'min-w-[220px] ' : ''
                          }${
                            h === 'Tgl Invoice' || h === 'Due Date' || h === 'Sent Date' ? 'min-w-[110px] ' : ''
                          }${
                            h === 'Grand Total' ? 'min-w-[140px] ' : ''
                          }${
                            h === 'Status' ? 'min-w-[110px] ' : ''
                          }${
                            idx === arr.length - 1
                              ? 'sticky right-0 z-20 min-w-[260px] bg-white border-l border-border shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.12)]'
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
                      const actions = STATUS_ACTIONS[inv.status] ?? []
                      const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-secondary/10'
                      return (
                        <tr key={inv.id} className={`group border-b border-border last:border-0 hover:bg-rok-50/30 ${rowBg}`}>
                          <td className="px-4 py-2.5 font-mono text-xs text-rok-700 font-medium min-w-[220px] max-w-[220px] truncate" title={inv.inv_number}>{inv.inv_number}</td>
                          <td className="px-4 py-2.5 text-xs min-w-[170px] max-w-[170px] truncate" title={cli?.name ?? undefined}>{cli?.name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs min-w-[220px] max-w-[220px] truncate" title={inv.invoice_term?.label ?? undefined}>{inv.invoice_term?.label ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap min-w-[110px]">{formatDate(inv.inv_date)}</td>
                          <td className={`px-4 py-2.5 text-xs whitespace-nowrap min-w-[110px] ${inv.status==='overdue'?'text-red-600 font-medium':''}`}>{formatDate(inv.due_date)}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap min-w-[110px]">{inv.issued_at ? formatDate(inv.issued_at) : '—'}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap min-w-[140px]"><Amount value={inv.grand_total} className="text-xs" /></td>
                          <td className="px-4 py-2.5 whitespace-nowrap min-w-[110px]"><StatusBadge status={inv.status} type="invoice" /></td>
                          <td
                            className="px-4 py-2.5 sticky right-0 z-10 min-w-[260px] border-l border-border bg-white shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.08)] group-hover:bg-white"
                          >
                            <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
                              <button type="button" onClick={() => setPreview(inv)} className="text-[11px] text-rok-600 hover:underline font-medium flex items-center gap-1 shrink-0"><Eye size={11} /> Preview</button>
                              {inv.status==='draft' && <button type="button" onClick={() => navigate(`/invoices/generate/${inv.invoice_term_id}?edit=${inv.id}`)} className="text-[11px] text-amber-700 hover:underline font-medium flex items-center gap-1 shrink-0"><RefreshCw size={11} /> Edit</button>}
                              {actions.map(a => (
                                <button
                                  type="button"
                                  key={a.next}
                                  onClick={() => {
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
                                  }}
                                  className={`text-[11px] hover:underline font-medium flex items-center gap-1 shrink-0 ${a.color}`}
                                >
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
                          <td className={`px-4 py-2.5 text-xs whitespace-nowrap min-w-[120px] ${term.status==='need_created'?'text-amber-600 font-medium':'text-muted-foreground'}`}>{formatDate(term.est_date)}</td>
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
  const term = terms?.find(t => t.id === termId)
  const qt = term?.quotation; const cli = qt?.client; const svc = qt?.service
  const [form, setForm] = useState({ inv_date: new Date().toISOString().split('T')[0], due_days: '30', tax_type: 'none' as TaxType, notes_template_id: '', custom_notes: '' })
  const [done, setDone] = useState<{ inv_number: string; grand_total: number; id: string } | null>(null)
  const [pdfErr, setPdfErr] = useState<string | null>(null)
  const [taxInitialized, setTaxInitialized] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const tax = calcTax(term?.nominal ?? 0, form.tax_type)
  const dueDate = (() => { const d = new Date(form.inv_date); d.setDate(d.getDate() + parseInt(form.due_days||'0')); return d })()

  useEffect(() => {
    if (!term || taxInitialized) return
    const qNotes = term.quotation?.notes?.toLowerCase?.() ?? ''
    const inferredTax: TaxType = qNotes.includes('tax: ppn 11%') ? 'ppn11' : 'none'
    setForm(f => ({ ...f, tax_type: inferredTax }))
    setTaxInitialized(true)
  }, [term, taxInitialized])
  const handleGenerate = async () => {
    if (!term||!qt||!cli||!svc) return
    setPdfErr(null)

    // Auto-detect voided invoice untuk re-generate
    // (pakai existing_invoice_id supaya UPDATE bukan INSERT, hindari 409 conflict)
    const voidedInvoiceId = (term.invoice as any)?.status === 'void'
      ? (term.invoice as any).id
      : undefined

    const invoice = await generateInvoice.mutateAsync({
      invoice_term_id:    term.id,
      inv_date:           form.inv_date,
      due_days:           parseInt(form.due_days),
      tax_type:           form.tax_type,
      notes_template_id:  form.notes_template_id || null,
      custom_notes:       form.custom_notes || null,
      nominal:            term.nominal,
      service_code:       svc.code,
      client_code:        cli.code,
      term_number:        term.term_number,
      existing_invoice_id: editId ?? voidedInvoiceId,
    }) as Invoice

    try {
      const pdfUrl = await generateAndUploadInvoicePdf(invoice)
      await updateInvoicePdfUrl.mutateAsync({ id: invoice.id, pdf_url: pdfUrl })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setPdfErr(`Invoice sudah dibuat, tapi gagal simpan PDF otomatis: ${msg}`)
      return
    }

    setDone({ inv_number: invoice.inv_number, grand_total: invoice.grand_total, id: invoice.id })
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
        <p className="text-xs text-green-600">PDF otomatis tersimpan dan status invoice berubah ke Issued.</p>
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={() => navigate('/invoices')}><FileText size={14} /> Ke Invoice List</Button>
          <Button variant="outline" onClick={() => { setDone(null); setForm({ inv_date: new Date().toISOString().split('T')[0], due_days: '30', tax_type: 'none', notes_template_id: '', custom_notes: '' }) }}>Buat Invoice Lain</Button>
        </div>
      </div>
    </div>
  )

  const isRegenerate = !editId && (term?.invoice as any)?.status === 'void'

  return (
    <div className="page max-w-3xl">
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
          <Button className="w-full" onClick={handleGenerate} loading={generateInvoice.isPending || updateInvoicePdfUrl.isPending}>
            <FileText size={14} />{editId?'Update Invoice':'Generate Invoice'}
          </Button>
          {generateInvoice.isError && <p className="text-xs text-destructive text-center">{String(generateInvoice.error)}</p>}
          {pdfErr && <p className="text-xs text-destructive text-center">{pdfErr}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Preview Modal — PDF hanya diload kalau user buka modal ──────
function InvoicePreviewModal({ invoice: baseInv, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { data: freshInv, isLoading, isError } = useInvoice(baseInv.id)
  const [showPDF, setShowPDF] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
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

        <Button variant="outline" className="w-full" onClick={onClose}>Tutup</Button>
      </div>
    </Modal>
  )
}
