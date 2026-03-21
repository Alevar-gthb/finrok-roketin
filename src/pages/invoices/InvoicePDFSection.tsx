// File ini di-lazy-load — react-pdf TIDAK pernah load kecuali user klik Download PDF
import { PDFDownloadLink } from '@react-pdf/renderer'
import FinrokInvoicePDF from '@/components/shared/InvoicePDF'
import { Button } from '@/components/shared'
import { Download } from 'lucide-react'
import type { Invoice } from '@/types/database'

export default function InvoicePDFSection({ invoice }: { invoice: Invoice }) {
  return (
    <PDFDownloadLink
      document={<FinrokInvoicePDF invoice={invoice} />}
      fileName={`${invoice.inv_number}.pdf`}
    >
      {({ loading, error }) => {
        if (error) return (
          <p className="text-xs text-destructive text-center">Gagal generate PDF: {String(error)}</p>
        )
        return (
          <Button className="w-full" disabled={loading}>
            <Download size={14} />
            {loading ? 'Generating PDF...' : 'Download PDF'}
          </Button>
        )
      }}
    </PDFDownloadLink>
  )
}
