import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import type { InvoiceLineItem } from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format angka ke Rupiah: Rp 42.000.000 */
export function formatRp(value: number | null | undefined, opts?: { short?: boolean }): string {
  if (value == null) return 'Rp 0'
  if (opts?.short && value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)}M`
  if (opts?.short && value >= 1_000_000)     return `Rp ${(value / 1_000_000).toFixed(1)}jt`
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(value)
}

/** Format tanggal ke DD/MM/YY */
export function formatDate(date: string | Date | null | undefined, fmt = 'dd/MM/yy'): string {
  if (!date) return '-'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, fmt, { locale: id })
  } catch {
    return '-'
  }
}

/** Format tanggal panjang: 14 Agustus 2025 */
export function formatDateLong(date: string | Date | null | undefined): string {
  return formatDate(date, 'd MMMM yyyy')
}

/** Generate client code dari nama: "PT Kereta Api Indonesia" → "KAI" */
export function generateClientCode(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '')
  if (!letters) return 'CLT'
  if (letters.length === 1) return letters + 'XX'
  if (letters.length === 2) return letters + 'X'
  if (letters.length === 3) return letters
  return letters[0] + letters[Math.floor(letters.length / 2)] + letters[letters.length - 1]
}

/** Build QT number: QT-001_DESIGN-KAI_200125 */
export function buildQTNumber(seq: number, serviceCode: string, clientCode: string, date: Date): string {
  const seqStr = seq.toString().padStart(3, '0')
  const dateStr = format(date, 'ddMMyy')
  return `QT-${seqStr}_${serviceCode.toUpperCase()}-${clientCode.toUpperCase()}_${dateStr}`
}

/** Build INV number: INV-001_DESIGN-KAI_T1_200125 */
export function buildINVNumber(seq: number, serviceCode: string, clientCode: string, termNum: number, date: Date): string {
  const seqStr = seq.toString().padStart(3, '0')
  const dateStr = format(date, 'ddMMyy')
  return `INV-${seqStr}_${serviceCode.toUpperCase()}-${clientCode.toUpperCase()}_T${termNum}_${dateStr}`
}

/** Calculate PPN */
export function calcTax(nominal: number, taxType: 'none' | 'ppn11' | 'ppn12') {
  if (taxType === 'none') return { subtotal: nominal, taxableBase: 0, taxAmount: 0, grandTotal: nominal }
  if (taxType === 'ppn11') {
    const taxAmount  = Math.round(nominal * 0.11)
    const grandTotal = nominal + taxAmount
    return { subtotal: nominal, taxableBase: nominal, taxAmount, grandTotal }
  }
  // ppn12: Metode DPP Nilai Lain — DPP dikurangi agar PPN × 12% = 11% dari nominal
  // DPP = nominal × (11/12), sehingga DPP × 12% = nominal × 11%
  const taxAmount   = Math.round(nominal * 0.11)
  const taxableBase = Math.round(nominal * 11 / 12)
  const grandTotal  = nominal + taxAmount
  return { subtotal: nominal, taxableBase, taxAmount, grandTotal }
}

/** Subtotal dari daftar line item: Σ(qty × unit_price), dibulatkan */
export function lineItemsSubtotal(items: InvoiceLineItem[] | null | undefined): number {
  if (!items || items.length === 0) return 0
  return Math.round(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0))
}

/**
 * Kembalikan line item tersimpan, atau fallback 1 baris (legacy invoice / termin)
 * memakai label termin sebagai deskripsi dan subtotal sebagai unit price.
 */
export function resolveLineItems(src: {
  line_items?: InvoiceLineItem[] | null
  term_label?: string | null
  subtotal?: number | null
}): InvoiceLineItem[] {
  if (src.line_items && src.line_items.length > 0) return src.line_items
  return [{ description: src.term_label ?? '', qty: 1, unit_price: src.subtotal ?? 0 }]
}

/** Status label mapping */
export const QT_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', deal: 'Deal', lost: 'Lost',
}
export const INV_STATUS_LABEL: Record<string, string> = {
  not_yet: 'Not Yet', need_created: 'Need Created',
  waiting: 'Waiting', paid: 'Paid', overdue: 'Overdue',
}
export const INV_DOC_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', issued: 'Issued', paid: 'Paid', overdue: 'Overdue', void: 'Void',
}

/** Truncate text */
export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n) + '…' : str
}

/**
 * Ekstrak pesan error yang terbaca dari berbagai bentuk error
 * (Error, PostgrestError Supabase, atau objek lain) supaya UI tidak
 * menampilkan "[object Object]".
 */
export function errMsg(err: unknown, fallback = 'Terjadi kesalahan.'): string {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (typeof err === 'object') {
    const e = err as { message?: unknown; error_description?: unknown; details?: unknown }
    const m = e.message ?? e.error_description ?? e.details
    if (typeof m === 'string' && m) return m
  }
  return fallback
}

/**
 * Kolom `notes` pada quotation menyimpan catatan user + metadata pajak
 * (Tax:/Subtotal:/Tax Amount:/Grand Total:) yang di-append otomatis saat create.
 * Helper ini memisahkan keduanya supaya catatan user bisa ditampilkan/diedit
 * tanpa kehilangan metadata pajak.
 */
const QT_META_PREFIX = /^(Tax|Subtotal|Tax Amount|Grand Total):/

export function parseQTNotes(notes: string | null | undefined): { userNote: string; metaLines: string[] } {
  if (!notes) return { userNote: '', metaLines: [] }
  const lines = notes.split('\n')
  const userNote: string[] = []
  const metaLines: string[] = []
  for (const line of lines) {
    if (QT_META_PREFIX.test(line.trim())) metaLines.push(line)
    else userNote.push(line)
  }
  return { userNote: userNote.join('\n').trim(), metaLines }
}

/** Gabungkan kembali catatan user dengan metadata pajak (untuk disimpan). */
export function composeQTNotes(userNote: string, metaLines: string[]): string | null {
  const result = [userNote.trim(), ...metaLines].filter(Boolean).join('\n')
  return result || null
}
