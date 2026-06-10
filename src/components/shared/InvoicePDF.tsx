/**
 * PATCH NOTES untuk InvoicePDF (atau file PDF generator kamu)
 *
 * File ini berisi komponen PDF yang sudah diupdate dengan semua 5 perubahan.
 * Sesuaikan import path sesuai struktur project kamu.
 *
 * Perubahan:
 * 1. Logo company dari DB (tidak stretch, max tinggi 3cm / lebar 10cm dalam PDF pt)
 * 2. Company info dari data company yang dipilih di quotation
 * 3. Hapus baris "Tax rate 12%" — gabung langsung ke baris PPN
 * 4. Header kolom "Part Number" → "Nomor", isi = nomor urut (1,2,3...)
 * 5. Description = label termin persis dari invoice_terms.label
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'

// ─── Tipe data yang perlu dikirim ke komponen ini ───────────────────────────

interface InvoiceCompany {
  name: string
  address: string | null
  phone: string | null
  website: string | null
  email: string | null
  logo_url: string | null
}

export interface InvoiceData {
  company: InvoiceCompany          // ← BARU: dari companies table via quotation
  inv_number: string
  inv_date: string
  due_date: string
  client_name: string
  client_address: string | null
  // Item tunggal dari invoice_term
  term_label: string               // ← POIN 5: pakai label termin langsung
  term_number: number              // ← POIN 4: nomor urut termin
  subtotal: number
  tax_type: 'none' | 'ppn11' | 'ppn12'
  taxable_base: number | null
  tax_amount: number
  grand_total: number
  notes: string | null
  document_title?: string
  expiration_label?: string
  expiration_date?: string
  show_notes?: boolean
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const C = {
  dark: '#1e2d3d',
  mid: '#4a5568',
  light: '#718096',
  border: '#e2e8f0',
  bg: '#f7f8fa',
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.mid, padding: 40 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logoBox: {
    // POIN 1: constrain logo — max 3cm tall (~85pt), max 10cm wide (~284pt)
    // objectFit via Image objectPosition keeps aspect ratio (no stretch)
    maxHeight: 85,
    maxWidth: 284,
    width: 'auto',
    height: 'auto',
  },
  companyInfo: { textAlign: 'right', maxWidth: 200 },
  companyName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 2 },
  companyDetail: { fontSize: 8, color: C.light, lineHeight: 1.4 },

  // Title
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  invoiceTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.dark },
  metaTable: { width: 220 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  metaLabel: { color: C.light, fontSize: 8, width: 90 },
  metaValue: { fontSize: 8, color: C.dark, flex: 1, textAlign: 'right' },

  // Customer
  section: { marginBottom: 16 },
  sectionHeader: {
    backgroundColor: C.dark, color: '#fff',
    padding: '4 8', fontSize: 8,
    fontFamily: 'Helvetica-Bold', letterSpacing: 0.5,
    marginBottom: 6,
  },
  customerName: { fontSize: 9, color: C.dark, fontFamily: 'Helvetica-Bold' },

  // Table
  tableHeader: {
    flexDirection: 'row', backgroundColor: C.dark,
    padding: '5 8', marginBottom: 0,
  },
  tableHeaderText: { color: '#fff', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tableRow: {
    flexDirection: 'row', padding: '6 8',
    borderBottomWidth: 0.5, borderBottomColor: C.border,
  },
  // Column widths — POIN 4: "Nomor" kolom lebih kecil
  colNomor:  { width: 40 },
  colDesc:   { flex: 1 },
  colQty:    { width: 40, textAlign: 'center' },
  colPrice:  { width: 80, textAlign: 'right' },
  colTotal:  { width: 80, textAlign: 'right' },

  // Totals
  totalsBox: { alignSelf: 'flex-end', width: 240, marginTop: 8 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5, borderBottomColor: C.border,
  },
  totalLabel: { fontSize: 8, color: C.mid },
  totalValue: { fontSize: 8, color: C.dark },
  grandRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: C.dark, padding: '5 6', marginTop: 2,
  },
  grandLabel: { fontSize: 9, color: '#fff', fontFamily: 'Helvetica-Bold' },
  grandValue: { fontSize: 9, color: '#fff', fontFamily: 'Helvetica-Bold' },

  // Notes
  notesBox: { marginTop: 24 },
  notesHeader: {
    backgroundColor: C.dark, color: '#fff',
    padding: '4 8', fontSize: 8,
    fontFamily: 'Helvetica-Bold', letterSpacing: 0.5, marginBottom: 6,
  },
  notesItem: { fontSize: 8, color: C.mid, marginBottom: 3, lineHeight: 1.4 },
})

// ─── Helper ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

function taxLabel(type: 'ppn11' | 'ppn12') {
  return type === 'ppn12' ? 'PPN 12% (DPP Nilai Lain)' : 'PPN 11%'
}

// ─── PDF Component ───────────────────────────────────────────────────────────

export default function InvoicePDF({ data }: { data: InvoiceData }) {
  const { company, tax_type, taxable_base, tax_amount } = data
  const hasTax = tax_type !== 'none' && tax_amount > 0
  const docTitle = data.document_title ?? 'INVOICE'
  const expirationLabel = data.expiration_label ?? 'Expiration Date'
  const expirationDate = data.expiration_date ?? data.due_date
  const showNotes = data.show_notes ?? true

  const noteLines = (data.notes ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── HEADER: Logo kiri, info company kanan ── */}
        <View style={s.header}>
          <View>
            {company.logo_url ? (
              /**
               * POIN 1 — Logo tidak stretch:
               * - maxHeight 85pt ≈ 3cm
               * - maxWidth 284pt ≈ 10cm
               * - width/height 'auto' biar proporsional
               * React-PDF Image secara default preserve aspect ratio
               * selama width atau height saja yang di-set (bukan keduanya fixed)
               */
              <Image
                src={company.logo_url}
                style={s.logoBox}
              />
            ) : (
              <Text style={[s.companyName, { fontSize: 14 }]}>{company.name}</Text>
            )}
          </View>

          <View style={s.companyInfo}>
            {/* Kalau ada logo, tetap tampilkan nama company di kanan */}
            {company.logo_url && (
              <Text style={s.companyName}>{company.name}</Text>
            )}
            {company.address && (
              <Text style={s.companyDetail}>{company.address}</Text>
            )}
            {company.phone && (
              <Text style={s.companyDetail}>Phone: {company.phone}</Text>
            )}
            {company.website && (
              <Text style={s.companyDetail}>{company.website}</Text>
            )}
          </View>
        </View>

        {/* ── INVOICE TITLE + META ── */}
        <View style={s.titleRow}>
          <Text style={s.invoiceTitle}>{docTitle}</Text>
          <View style={s.metaTable}>
            {[
              ['Date', data.inv_date],
              [expirationLabel, expirationDate],
              ['Invoice #', data.inv_number],
            ].map(([label, value]) => (
              <View key={label} style={s.metaRow}>
                <Text style={s.metaLabel}>{label}</Text>
                <Text style={s.metaValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── CUSTOMER ── */}
        <View style={s.section}>
          <Text style={s.sectionHeader}>CUSTOMER</Text>
          <Text style={s.customerName}>{data.client_name}</Text>
          {data.client_address && (
            <Text style={{ fontSize: 8, color: C.light }}>{data.client_address}</Text>
          )}
        </View>

        {/* ── TABLE ── */}
        {/* Header row — POIN 4: "NOMOR" bukan "PART NUMBER" */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colNomor]}>NOMOR</Text>
          <Text style={[s.tableHeaderText, s.colDesc]}>DESCRIPTION</Text>
          <Text style={[s.tableHeaderText, s.colQty]}>QTY</Text>
          <Text style={[s.tableHeaderText, s.colPrice]}>UNIT PRICE</Text>
          <Text style={[s.tableHeaderText, s.colTotal]}>TOTAL AMOUNT</Text>
        </View>

        {/* Single item row — POIN 4 & 5 */}
        <View style={s.tableRow}>
          {/* POIN 4: Isi kolom = nomor urut, bukan kode service */}
          <Text style={[{ fontSize: 9, color: C.dark }, s.colNomor]}>
            {data.term_number}
          </Text>
          {/* POIN 5: Description = label termin persis */}
          <Text style={[{ fontSize: 9, color: C.dark }, s.colDesc]}>
            {data.term_label}
          </Text>
          <Text style={[{ fontSize: 9, color: C.dark }, s.colQty]}>1</Text>
          <Text style={[{ fontSize: 9, color: C.dark }, s.colPrice]}>
            {fmt(data.subtotal)}
          </Text>
          <Text style={[{ fontSize: 9, color: C.dark }, s.colTotal]}>
            {fmt(data.subtotal)}
          </Text>
        </View>

        {/* ── TOTALS — POIN 3: Hilangkan baris tax rate % ── */}
        <View style={s.totalsBox}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{fmt(data.subtotal)}</Text>
          </View>

          {hasTax && taxable_base && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Taxable (DPP)</Text>
              <Text style={s.totalValue}>{fmt(taxable_base)}</Text>
            </View>
          )}

          {/* POIN 3: Baris "Tax rate 12%" DIHAPUS */}
          {/* Langsung tampilkan PPN dengan nominalnya saja */}
          {hasTax && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>{taxLabel(tax_type as 'ppn11' | 'ppn12')}</Text>
              <Text style={s.totalValue}>{fmt(tax_amount)}</Text>
            </View>
          )}

          <View style={s.grandRow}>
            <Text style={s.grandLabel}>TOTAL</Text>
            <Text style={s.grandValue}>{fmt(data.grand_total)}</Text>
          </View>
        </View>

        {/* ── NOTES ── */}
        {showNotes && noteLines.length > 0 && (
          <View style={s.notesBox}>
            <Text style={s.notesHeader}>TERMS OF SALE AND OTHER COMMENTS</Text>
            {noteLines.map((line, i) => (
              <Text key={i} style={s.notesItem}>
                {line}
              </Text>
            ))}
          </View>
        )}

      </Page>
    </Document>
  )
}
