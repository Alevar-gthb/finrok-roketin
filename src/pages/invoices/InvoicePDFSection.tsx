// File ini di-lazy-load — react-pdf TIDAK pernah load kecuali user klik Download PDF
import { pdf } from '@react-pdf/renderer'
import FinrokInvoicePDF from '@/components/shared/InvoicePDF'
import { Button } from '@/components/shared'
import { Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Invoice } from '@/types/database'
import { useEffect, useRef, useState } from 'react'

// Fetch company + term data dari invoice
// Jalur: invoice → invoice_term → quotation → company + client
async function fetchInvoiceContext(invoice: Invoice) {
  const { data, error } = await supabase
    .from('invoice_terms')
    .select(`
      label,
      term_number,
      quotations (
        company_id,
        companies (
          name, address, phone, website, email, logo_url
        ),
        clients (
          name, address
        )
      )
    `)
    .eq('id', invoice.invoice_term_id)
    .single()

  if (error) throw error
  return data
}

// Trigger unduhan blob ke folder Downloads user.
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function InvoicePDFSection({ invoice }: { invoice: Invoice }) {
  const { data: ctx, isLoading: ctxLoading, error: ctxError } = useQuery({
    queryKey: ['invoice-context', invoice.id],
    queryFn: () => fetchInvoiceContext(invoice),
  })

  const [phase, setPhase] = useState<'generating' | 'done' | 'error'>('generating')
  const [errMsg, setErrMsg] = useState('')
  const autoRan = useRef(false)

  const generateAndDownload = async () => {
    if (!ctx) return
    setPhase('generating')

    const qt = ctx.quotations as any
    const company = qt?.companies
    const client  = qt?.clients

    const pdfData = {
      company: {
        name:     company?.name     ?? 'PT Roketin Kreatif Teknologi',
        address:  company?.address  ?? null,
        phone:    company?.phone    ?? null,
        website:  company?.website  ?? null,
        email:    company?.email    ?? null,
        logo_url: company?.logo_url ?? null,
      },
      inv_number:   invoice.inv_number,
      inv_date:     invoice.inv_date,
      due_date:     invoice.due_date,
      client_name:  client?.name    ?? '',
      client_address: client?.address ?? null,
      term_label:   ctx.label,
      term_number:  ctx.term_number,
      line_items:   invoice.line_items ?? null,
      subtotal:     invoice.subtotal,
      tax_type:     invoice.tax_type as 'none' | 'ppn11' | 'ppn12',
      taxable_base: invoice.taxable_base ?? null,
      tax_amount:   invoice.tax_amount,
      grand_total:  invoice.grand_total,
      notes:        invoice.custom_notes || invoice.notes_template?.content || null,
    }

    try {
      const blob = await pdf(<FinrokInvoicePDF data={pdfData} />).toBlob()
      downloadBlob(blob, `${invoice.inv_number}.pdf`)
      setPhase('done')
    } catch (e) {
      setErrMsg(String(e))
      setPhase('error')
    }
  }

  // Begitu data context siap, langsung generate + download (cukup 1 klik dari modal).
  useEffect(() => {
    if (ctx && !autoRan.current) {
      autoRan.current = true
      generateAndDownload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx])

  if (ctxLoading) return (
    <Button className="w-full" disabled>
      <Download size={14} /> Memuat data...
    </Button>
  )

  if (ctxError || !ctx) return (
    <p className="text-xs text-destructive text-center">
      Gagal memuat data company. Pastikan quotation sudah terhubung ke company.
    </p>
  )

  if (phase === 'error') return (
    <p className="text-xs text-destructive text-center">
      Gagal generate PDF: {errMsg}
    </p>
  )

  return (
    <Button
      className="w-full"
      disabled={phase === 'generating'}
      loading={phase === 'generating'}
      onClick={generateAndDownload}
    >
      <Download size={14} />
      {phase === 'generating' ? 'Menyiapkan PDF...' : 'Download PDF lagi'}
    </Button>
  )
}
