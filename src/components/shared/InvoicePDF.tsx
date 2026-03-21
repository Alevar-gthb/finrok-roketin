import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'
import type { Invoice } from '@/types/database'
import { formatRp, formatDateLong } from '@/lib/utils'

// Use built-in Helvetica — no external font needed
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'Helvetica' },
    { src: 'Helvetica-Bold', fontWeight: 700 },
    { src: 'Helvetica-Bold', fontWeight: 600 },
  ],
})

const NAVY  = '#1B2E4B'
const BLUE  = '#4a73f5'
const GRAY  = '#64748b'
const LGRAY = '#f1f5f9'
const DGRAY = '#334155'
const WHITE = '#ffffff'
const RED   = '#dc2626'

const s = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 9, color: DGRAY, paddingHorizontal: 36, paddingVertical: 32, backgroundColor: WHITE },
  // Header
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  logoBlock:   { flexDirection: 'column', gap: 2 },
  logoText:    { fontSize: 18, fontWeight: 700, color: NAVY, letterSpacing: -0.5 },
  companyName: { fontSize: 9, fontWeight: 600, color: NAVY, marginTop: 2 },
  companyAddr: { fontSize: 7.5, color: GRAY, lineHeight: 1.5, marginTop: 1 },
  invoiceTitle:{ fontSize: 28, fontWeight: 700, color: NAVY, textAlign: 'right' },
  // Meta table (right side)
  metaTable:   { marginTop: 4, alignSelf: 'flex-end' },
  metaRow:     { flexDirection: 'row', marginBottom: 2 },
  metaLabel:   { fontSize: 7.5, color: GRAY, width: 88, textAlign: 'right', paddingRight: 8 },
  metaValue:   { fontSize: 7.5, fontWeight: 600, color: DGRAY, backgroundColor: LGRAY, paddingHorizontal: 6, paddingVertical: 1.5, minWidth: 110, borderRadius: 2 },
  // Divider
  divider:     { height: 0.5, backgroundColor: '#e2e8f0', marginBottom: 14 },
  // Customer block
  custHeader:  { backgroundColor: NAVY, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
  custLabel:   { fontSize: 7.5, fontWeight: 700, color: WHITE, letterSpacing: 0.8 },
  custName:    { fontSize: 9, fontWeight: 600, color: DGRAY, marginBottom: 1 },
  custLine:    { fontSize: 8, color: GRAY, lineHeight: 1.5 },
  // Table
  tableWrap:   { marginTop: 14 },
  tableHead:   { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 4 },
  thText:      { fontSize: 7.5, fontWeight: 700, color: WHITE },
  tableRow:    { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingVertical: 6, paddingHorizontal: 4 },
  tableRowAlt: { backgroundColor: LGRAY },
  tdText:      { fontSize: 8, color: DGRAY, lineHeight: 1.5 },
  // Col widths
  colPart:     { width: 36 },
  colDesc:     { flex: 1, paddingRight: 8 },
  colQty:      { width: 24, textAlign: 'center' },
  colPrice:    { width: 80, textAlign: 'right' },
  colTotal:    { width: 80, textAlign: 'right' },
  // Subtotal block
  subtotalWrap:{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  subtotalBox: { width: 200 },
  subRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  subLabel:    { fontSize: 8, color: GRAY },
  subValue:    { fontSize: 8, color: DGRAY, fontWeight: 600 },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 4, marginTop: 2 },
  totalLabel:  { fontSize: 9, fontWeight: 700, color: WHITE },
  totalValue:  { fontSize: 9, fontWeight: 700, color: WHITE },
  // Terms
  termsWrap:   { marginTop: 14 },
  termsHeader: { backgroundColor: NAVY, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 5 },
  termsLabel:  { fontSize: 7.5, fontWeight: 700, color: WHITE, letterSpacing: 0.8 },
  termsLine:   { fontSize: 7.5, color: GRAY, lineHeight: 1.6, marginBottom: 1 },
  // Footer
  footer:      { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: '#e2e8f0', paddingTop: 6 },
  footerText:  { fontSize: 7.5, color: GRAY, fontWeight: 600 },
})

interface FinrokInvoicePDFProps {
  invoice: Invoice
}

export default function FinrokInvoicePDF({ invoice }: FinrokInvoicePDFProps) {
  const term  = invoice.invoice_term
  const qt    = term?.quotation
  const cli   = qt?.client
  const svc   = qt?.service
  const notes = invoice.custom_notes ?? invoice.notes_template?.content ?? ''

  const taxLabel = invoice.tax_type === 'ppn12' ? 'PPN 12% (DPP Nilai Lain)' : invoice.tax_type === 'ppn11' ? 'PPN 11%' : null
  const taxRate  = invoice.tax_type === 'ppn12' ? 0.12 : invoice.tax_type === 'ppn11' ? 0.11 : 0

  return (
    <Document title={invoice.inv_number} author="PT Roketin Kreatif Teknologi">
      <Page size="A4" style={s.page}>

        {/* ── HEADER ── */}
        <View style={s.headerRow}>
          <View style={s.logoBlock}>
            <Text style={s.logoText}>Roketin</Text>
            <Text style={s.companyName}>PT ROKETIN KREATIF TEKNOLOGI</Text>
            <Text style={s.companyAddr}>
              Komplek Kopo Mas Regency Blok A-3{'\n'}
              Bandung - Jawa Barat{'\n'}
              Phone: 081310162125  |  www.roketin.com
            </Text>
          </View>
          <View>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <View style={s.metaTable}>
              {[
                ['Date',            invoice.inv_date  ? formatDateLong(invoice.inv_date)  : '-'],
                ['Expiration Date', invoice.due_date  ? formatDateLong(invoice.due_date)  : '-'],
                ['Invoice #',       invoice.inv_number],
                ['Customer ID',     cli?.code ?? '-'],
              ].map(([label, value]) => (
                <View key={label} style={s.metaRow}>
                  <Text style={s.metaLabel}>{label}</Text>
                  <Text style={s.metaValue}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── CUSTOMER ── */}
        <View style={s.custHeader}>
          <Text style={s.custLabel}>CUSTOMER</Text>
        </View>
        {cli && (
          <View>
            <Text style={s.custName}>{cli.pic_name ?? cli.name}</Text>
            <Text style={s.custLine}>{cli.name}</Text>
            {cli.address && <Text style={s.custLine}>{cli.address}</Text>}
            {(cli.city || cli.province || cli.postal_code) && (
              <Text style={s.custLine}>
                {[cli.city?.toUpperCase(), cli.province?.toUpperCase(), cli.postal_code].filter(Boolean).join(' ')}
              </Text>
            )}
          </View>
        )}

        {/* ── ITEM TABLE ── */}
        <View style={s.tableWrap}>
          <View style={s.tableHead}>
            <Text style={[s.thText, s.colPart]}>PART{'\n'}NUMBER</Text>
            <Text style={[s.thText, s.colDesc]}>DESCRIPTION</Text>
            <Text style={[s.thText, s.colQty]}>QTY</Text>
            <Text style={[s.thText, s.colPrice]}>UNIT PRICE</Text>
            <Text style={[s.thText, s.colTotal]}>TOTAL AMOUNT</Text>
          </View>

          <View style={s.tableRow}>
            <Text style={[s.tdText, s.colPart]}>{svc?.code ?? '-'}</Text>
            <Text style={[s.tdText, s.colDesc]}>{term?.label ?? qt?.title ?? '-'}</Text>
            <Text style={[s.tdText, s.colQty]}>1</Text>
            <Text style={[s.tdText, s.colPrice]}>{formatRp(invoice.subtotal)}</Text>
            <Text style={[s.tdText, s.colTotal]}>{formatRp(invoice.subtotal)}</Text>
          </View>
        </View>

        {/* ── SUBTOTAL ── */}
        <View style={s.subtotalWrap}>
          <View style={s.subtotalBox}>
            <View style={s.subRow}>
              <Text style={s.subLabel}>Subtotal</Text>
              <Text style={s.subValue}>{formatRp(invoice.subtotal)}</Text>
            </View>
            {taxLabel && invoice.taxable_base && (
              <>
                <View style={s.subRow}>
                  <Text style={s.subLabel}>Taxable (DPP)</Text>
                  <Text style={s.subValue}>{formatRp(invoice.taxable_base)}</Text>
                </View>
                <View style={s.subRow}>
                  <Text style={s.subLabel}>Tax rate</Text>
                  <Text style={s.subValue}>{(taxRate * 100).toFixed(0)}%</Text>
                </View>
                <View style={s.subRow}>
                  <Text style={s.subLabel}>{taxLabel}</Text>
                  <Text style={s.subValue}>{formatRp(invoice.tax_amount)}</Text>
                </View>
              </>
            )}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>TOTAL</Text>
              <Text style={s.totalValue}>{formatRp(invoice.grand_total)}</Text>
            </View>
          </View>
        </View>

        {/* ── TERMS ── */}
        {notes.trim() !== '' && (
          <View style={s.termsWrap}>
            <View style={s.termsHeader}>
              <Text style={s.termsLabel}>TERMS OF SALE AND OTHER COMMENTS</Text>
            </View>
            {notes.split('\n').filter(l => l.trim()).map((line, i) => (
              <Text key={i} style={s.termsLine}>{line}</Text>
            ))}
          </View>
        )}

        {/* ── FOOTER ── */}
        <View style={s.footer}>
          <Text style={s.footerText}>PT ROKETIN KREATIF TEKNOLOGI</Text>
        </View>

      </Page>
    </Document>
  )
}
