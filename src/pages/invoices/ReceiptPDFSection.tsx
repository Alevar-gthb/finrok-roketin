import { PDFDownloadLink } from '@react-pdf/renderer'
import FinrokInvoicePDF from '@/components/shared/InvoicePDF'
import { Button } from '@/components/shared'
import { Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Invoice, Payment } from '@/types/database'

async function fetchInvoiceContext(invoice: Invoice) {
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
    .eq('id', invoice.invoice_term_id)
    .single()
  if (error) throw error
  return data
}

export default function ReceiptPDFSection({ invoice, payment }: { invoice: Invoice; payment: Payment }) {
  const { data: ctx, isLoading: ctxLoading, error: ctxError } = useQuery({
    queryKey: ['receipt-context', invoice.id],
    queryFn: () => fetchInvoiceContext(invoice),
  })

  if (ctxLoading) {
    return (
      <Button className="w-full" disabled>
        <Download size={14} /> Memuat data...
      </Button>
    )
  }

  if (ctxError || !ctx) {
    return (
      <p className="text-xs text-destructive text-center">
        Gagal memuat data receipt.
      </p>
    )
  }

  const qt = ctx.quotations as any
  const company = qt?.companies
  const client = qt?.clients
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
    notes: null,
    document_title: 'RECEIPT',
    expiration_label: 'Payment Date',
    expiration_date: payment.pay_date,
    show_notes: false,
  }

  return (
    <PDFDownloadLink
      document={<FinrokInvoicePDF data={pdfData} />}
      fileName={`RECEIPT_${invoice.inv_number}.pdf`}
    >
      {({ loading, error }) => {
        if (error) {
          return (
            <p className="text-xs text-destructive text-center">
              Gagal generate Receipt: {String(error)}
            </p>
          )
        }
        return (
          <Button className="w-full" disabled={loading} variant="outline">
            <Download size={14} />
            {loading ? 'Generating Receipt...' : 'Download Receipt'}
          </Button>
        )
      }}
    </PDFDownloadLink>
  )
}
