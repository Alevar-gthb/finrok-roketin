import { useState, useRef } from 'react'
import { useInvoices, useMarkPaid } from '@/hooks/useFinrok'
import { supabase } from '@/lib/supabase'
import { PageHeader, StatusBadge, Button, Input, Select, Modal, EmptyState, LoadingSpinner, Amount } from '@/components/shared'
import { formatRp, formatDate } from '@/lib/utils'
import type { Invoice } from '@/types/database'
import { CreditCard, Search, Paperclip, X } from 'lucide-react'
import { useCompanyStore } from '@/store/useCompanyStore'

export default function Payments() {
  const { selectedCompanyId } = useCompanyStore()
  // Default: hanya tampilkan issued + overdue
  const { data: invoices, isLoading } = useInvoices({ companyId: selectedCompanyId })
  const markPaid = useMarkPaid()
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilter] = useState<'issued_overdue'|'all'|'paid'>('issued_overdue')
  const [payModal, setPayModal]   = useState<Invoice | null>(null)
  const [form, setForm] = useState({
    pay_date: new Date().toISOString().split('T')[0],
    method: 'transfer', reference: '', bank_name: '', notes: '',
  })
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const filtered = (invoices ?? []).filter(inv => {
    const matchStatus =
      filterStatus === 'all' ? true :
      filterStatus === 'paid' ? inv.status === 'paid' :
      /* issued_overdue */ ['issued','overdue'].includes(inv.status)
    const s = search.toLowerCase()
    const matchSearch = !s || inv.inv_number.toLowerCase().includes(s) || (inv.invoice_term?.quotation?.client?.name ?? '').toLowerCase().includes(s)
    return matchStatus && matchSearch
  })

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
        const ext  = receiptFile.name.split('.').pop()
        const path = `receipts/${payModal.id}_${Date.now()}.${ext}`
        const { data: up, error: upErr } = await supabase.storage
          .from('receipts')
          .upload(path, receiptFile, { upsert: true })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(up.path)
        receipt_url = urlData.publicUrl
      }

      await markPaid.mutateAsync({
        invoice_id: payModal.id,
        pay_date:   form.pay_date,
        amount:     payModal.grand_total,
        method:     form.method,
        reference:  form.reference || undefined,
        bank_name:  form.bank_name || undefined,
        notes:      form.notes || undefined,
        receipt_url,
      })

      setPayModal(null)
      setReceiptFile(null)
      setForm({ pay_date: new Date().toISOString().split('T')[0], method: 'transfer', reference: '', bank_name: '', notes: '' })
    } catch (err: any) {
      setUploadError(err.message ?? 'Upload gagal')
    } finally {
      setUploading(false)
    }
  }

  if (isLoading) return <LoadingSpinner />

  const issuedInvoices  = (invoices ?? []).filter(i => ['issued','overdue'].includes(i.status))
  const totalWaiting    = issuedInvoices.reduce((s, i) => s + i.grand_total, 0)
  const totalPaid       = (invoices ?? []).filter(i => i.status === 'paid').reduce((s, i) => s + i.grand_total, 0)
  const totalOverdue    = (invoices ?? []).filter(i => i.status === 'overdue').reduce((s, i) => s + i.grand_total, 0)

  return (
    <div className="page">
      <PageHeader title="Payment Tracking" sub="Monitor dan konfirmasi pembayaran invoice" />
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Menunggu Bayar', value: formatRp(totalWaiting, { short: true }), cls: 'border-blue-200 bg-blue-50/40' },
          { label: 'Overdue',        value: formatRp(totalOverdue, { short: true }), cls: 'border-red-200 bg-red-50/40' },
          { label: 'Total Paid',     value: formatRp(totalPaid, { short: true }),    cls: 'border-green-200 bg-green-50/40' },
        ].map(c => (
          <div key={c.label} className={`rounded-lg border p-3 ${c.cls}`}>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className="text-xl font-semibold num mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-rok-400" placeholder="Cari invoice, client..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {([
          { key: 'issued_overdue', label: `Perlu Dibayar (${issuedInvoices.length})` },
          { key: 'paid', label: 'Lunas' },
          { key: 'all', label: 'Semua' },
        ] as const).map(s => (
          <button key={s.key} onClick={() => setFilter(s.key)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === s.key ? 'bg-rok-500 text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? <EmptyState title="Tidak ada invoice ditemukan" description={filterStatus === 'issued_overdue' ? 'Belum ada invoice berstatus Issued / Overdue.' : ''} /> : (
        <div className="rounded-lg border border-border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                {['INV Number','Client','Termin','Tgl Invoice','Due Date','Grand Total','Status','Aksi'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, i) => {
                const cli = inv.invoice_term?.quotation?.client
                return (
                  <tr key={inv.id} className={`border-b border-border last:border-0 hover:bg-rok-50/30 ${i%2===0?'bg-white':'bg-secondary/10'}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-rok-700 font-medium whitespace-nowrap">{inv.inv_number}</td>
                    <td className="px-4 py-2.5 text-xs max-w-[140px] truncate">{cli?.name ?? '-'}</td>
                    <td className="px-4 py-2.5 text-xs max-w-[160px] truncate">{inv.invoice_term?.label ?? '-'}</td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">{formatDate(inv.inv_date)}</td>
                    <td className={`px-4 py-2.5 text-xs whitespace-nowrap ${inv.status==='overdue'?'text-red-600 font-medium':''}`}>{formatDate(inv.due_date)}</td>
                    <td className="px-4 py-2.5 text-right"><Amount value={inv.grand_total} className="text-xs" /></td>
                    <td className="px-4 py-2.5"><StatusBadge status={inv.status} type="invoice" /></td>
                    <td className="px-4 py-2.5">
                      {['issued','overdue'].includes(inv.status) && (
                        <Button size="sm" variant="outline" onClick={() => setPayModal(inv)}>
                          <CreditCard size={12} /> Mark Paid
                        </Button>
                      )}
                      {inv.status === 'paid' && <span className="text-xs text-green-600 font-medium">✓ Lunas</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {payModal && (
        <Modal open title={`Konfirmasi Pembayaran — ${payModal.inv_number}`} onClose={() => { setPayModal(null); setReceiptFile(null) }} width="max-w-md">
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-md p-3 flex justify-between text-sm">
              <span className="text-green-700">Grand Total</span>
              <Amount value={payModal.grand_total} className="font-bold text-green-700" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tanggal Bayar *" type="date" value={form.pay_date} onChange={e => set('pay_date', e.target.value)} />
              <Select label="Metode" value={form.method} onChange={e => set('method', e.target.value)}>
                <option value="transfer">Transfer Bank</option>
                <option value="cash">Cash</option>
                <option value="giro">Giro</option>
                <option value="other">Lainnya</option>
              </Select>
            </div>
            <Input label="Nomor Referensi / Bukti Transfer" placeholder="REF/TRF/..." value={form.reference} onChange={e => set('reference', e.target.value)} />
            <Input label="Bank Pengirim" placeholder="BCA, Mandiri..." value={form.bank_name} onChange={e => set('bank_name', e.target.value)} />
            <Input label="Catatan (opsional)" value={form.notes} onChange={e => set('notes', e.target.value)} />

            {/* Upload Bukti */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Bukti Transfer (opsional) — JPG, PNG, atau PDF, maks 2MB
              </label>
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
              <Button onClick={handlePay} loading={uploading || markPaid.isPending} disabled={!form.pay_date}>
                <CreditCard size={13} /> Konfirmasi Lunas
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
