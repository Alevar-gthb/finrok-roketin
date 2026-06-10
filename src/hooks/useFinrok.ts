import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buildQTNumber, buildINVNumber, calcTax } from '@/lib/utils'
import React from 'react'
import type {
  Client, Service, NotesTemplate, Quotation, InvoiceTerm,
  Invoice, Payment, QTStatus, TaxType, QuotationSummary,
  MonthlyIncome, MonthlyForecast,
} from '@/types/database'

// ============================================================
// CLIENTS
// ============================================================
export const useClients = (activeOnly = true) =>
  useQuery({
    queryKey: ['clients', activeOnly],
    queryFn: async () => {
      let q = supabase.from('clients').select('*').order('name')
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return data as Client[]
    },
  })

export const useClient = (id: string | undefined) =>
  useQuery({
    queryKey: ['client', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', id!).single()
      if (error) throw error
      return data as Client
    },
  })

export const useUpsertClient = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<Client> & { name: string; code: string }) => {
      const { id, ...rest } = payload
      if (id) {
        const { data, error } = await supabase.from('clients').update(rest).eq('id', id).select().single()
        if (error) throw error
        return data
      } else {
        const { data, error } = await supabase.from('clients').insert(rest).select().single()
        if (error) throw error
        return data
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

// ============================================================
// SERVICES
// ============================================================
export const useServices = () =>
  useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('*').order('name')
      if (error) throw error
      return data as Service[]
    },
  })

export const useUpsertService = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<Service> & { name: string; code: string }) => {
      const { id, ...rest } = payload
      if (id) {
        const { data, error } = await supabase.from('services').update(rest).eq('id', id).select().single()
        if (error) throw error
        return data
      } else {
        const { data, error } = await supabase.from('services').insert(rest).select().single()
        if (error) throw error
        return data
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

// ============================================================
// NOTES TEMPLATES
// ============================================================
export const useNotesTemplates = () =>
  useQuery({
    queryKey: ['notes_templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('notes_templates').select('*').order('name')
      if (error) throw error
      return data as NotesTemplate[]
    },
  })

export const useUpsertNotesTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<NotesTemplate> & { code: string; name: string; content: string }) => {
      const { id, ...rest } = payload
      if (id) {
        const { data, error } = await supabase.from('notes_templates').update(rest).eq('id', id).select().single()
        if (error) throw error
        return data
      } else {
        const { data, error } = await supabase.from('notes_templates').insert(rest).select().single()
        if (error) throw error
        return data
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes_templates'] }),
  })
}

// ============================================================
// QUOTATIONS
// ============================================================
export const useQuotations = (filters?: { status?: QTStatus; client_id?: string }) =>
  useQuery({
    queryKey: ['quotations', filters],
    queryFn: async () => {
      let q = supabase
        .from('quotations')
        .select('*, client:clients(*), service:services(*)')
        .order('seq', { ascending: false })
      if (filters?.status)    q = q.eq('status', filters.status)
      if (filters?.client_id) q = q.eq('client_id', filters.client_id)
      const { data, error } = await q
      if (error) throw error
      return data as Quotation[]
    },
  })

// ── UPDATED: terima companyId untuk filter ──
export const useQuotationSummaries = (companyId?: string | null) =>
  useQuery({
    queryKey: ['v_quotation_summary', companyId],
    queryFn: async () => {
      let q = supabase
        .from('v_quotation_summary')
        .select('*')
        .order('qt_date', { ascending: false })
      if (companyId) q = q.eq('company_id', companyId)
      const { data, error } = await q
      if (error) throw error
      return data as QuotationSummary[]
    },
  })

export const useQuotation = (id: string | undefined) =>
  useQuery({
    queryKey: ['quotation', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select('*, client:clients(*), service:services(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Quotation
    },
  })

export const useCreateQuotation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      client_id: string; service_id: string; title: string
      nominal: number; qt_date: string; notes?: string; project_id?: string
      client_code: string; service_code: string; company_id?: string
    }) => {
      const { data: seqData, error: seqErr } = await supabase.rpc('next_qt_seq')
      if (seqErr) throw seqErr
      const seq: number = seqData

      const qt_number = buildQTNumber(seq, payload.service_code, payload.client_code, new Date(payload.qt_date))

      const { data, error } = await supabase.from('quotations').insert({
        seq,
        qt_number,
        qt_date:    payload.qt_date,
        client_id:  payload.client_id,
        service_id: payload.service_id,
        project_id: payload.project_id ?? null,
        company_id: payload.company_id ?? null,
        title:      payload.title,
        nominal:    payload.nominal,
        status:     'draft',
        notes:      payload.notes ?? null,
      }).select('*, client:clients(*), service:services(*)').single()
      if (error) throw error

      await supabase.from('quotation_status_logs').insert({
        quotation_id: data.id,
        from_status:  null,
        to_status:    'draft',
      })

      return data as Quotation
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      qc.invalidateQueries({ queryKey: ['v_quotation_summary'] })
    },
  })
}

export const useUpdateQuotation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id: string; title: string; nominal: number; notes?: string }) => {
      const { error } = await supabase.from('quotations')
        .update({ title: payload.title, nominal: payload.nominal, notes: payload.notes ?? null })
        .eq('id', payload.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      qc.invalidateQueries({ queryKey: ['v_quotation_summary'] })
      qc.invalidateQueries({ queryKey: ['invoice_terms_all'] })
    },
  })
}

export const useDeleteInvoiceTerm = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (termId: string) => {
      // Get linked invoice IDs first
      const { data: linkedInvoices } = await supabase.from('invoices').select('id').eq('invoice_term_id', termId)
      const invoiceIds = (linkedInvoices ?? []).map(i => i.id)

      // Delete payments linked to those invoices (FK: payments.invoice_id → invoices.id RESTRICT)
      if (invoiceIds.length > 0) {
        const { error: payErr } = await supabase.from('payments').delete().in('invoice_id', invoiceIds)
        if (payErr) throw payErr
      }

      // Delete linked invoices
      const { error: invErr } = await supabase.from('invoices').delete().eq('invoice_term_id', termId)
      if (invErr) throw invErr

      // Delete the term
      const { error } = await supabase.from('invoice_terms').delete().eq('id', termId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice_terms'] })
      qc.invalidateQueries({ queryKey: ['invoice_terms_all'] })
      qc.invalidateQueries({ queryKey: ['v_quotation_summary'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
    },
  })
}

export const useUpdateQTStatus = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string; from_status: QTStatus; to_status: QTStatus; notes?: string
    }) => {
      const { error } = await supabase.from('quotations')
        .update({ status: payload.to_status, lost_reason: payload.notes ?? null })
        .eq('id', payload.id)
      if (error) throw error

      await supabase.from('quotation_status_logs').insert({
        quotation_id: payload.id,
        from_status:  payload.from_status,
        to_status:    payload.to_status,
        notes:        payload.notes ?? null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      qc.invalidateQueries({ queryKey: ['v_quotation_summary'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ============================================================
// INVOICE TERMS
// ============================================================
export const useInvoiceTerms = (quotationId?: string) =>
  useQuery({
    queryKey: ['invoice_terms', quotationId],
    enabled: !!quotationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_terms')
        .select('*, invoice:invoices(*)')
        .eq('quotation_id', quotationId!)
        .order('term_number')
      if (error) throw error
      return data as InvoiceTerm[]
    },
  })

// ── UPDATED: terima companyId untuk filter ──
export const useAllInvoiceTerms = (filters?: { status?: string; companyId?: string | null }) =>
  useQuery({
    queryKey: ['invoice_terms_all', filters],
    queryFn: async () => {
      let q = supabase
        .from('invoice_terms')
        .select('*, quotation:quotations!inner(*, client:clients(*), service:services(*)), invoice:invoices(*)')
        .order('est_date', { ascending: true, nullsFirst: false })
      if (filters?.status)    q = q.eq('status', filters.status)
      if (filters?.companyId) q = q.eq('quotation.company_id', filters.companyId)
      const { data, error } = await q
      if (error) throw error
      return data as InvoiceTerm[]
    },
  })

export const useCreateInvoiceTerms = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      quotation_id: string
      total_terms: number
      terms: { term_number: number; label: string; nominal: number; est_date: string }[]
    }) => {
      const rows = payload.terms.map(t => ({
        quotation_id: payload.quotation_id,
        total_terms:  payload.total_terms,
        term_number:  t.term_number,
        label:        t.label,
        nominal:      t.nominal,
        est_date:     t.est_date,
        status:       'not_yet' as const,
      }))
      const { data, error } = await supabase.from('invoice_terms').insert(rows).select()
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['invoice_terms', vars.quotation_id] })
      qc.invalidateQueries({ queryKey: ['invoice_terms_all'] })
      qc.invalidateQueries({ queryKey: ['v_quotation_summary'] })
    },
  })
}

// ============================================================
// INVOICES
// ============================================================
// ── UPDATED: terima companyId untuk filter ──
export const useInvoices = (filters?: { status?: string; companyId?: string | null }) =>
  useQuery({
    queryKey: ['invoices', filters],
    queryFn: async () => {
      let q = supabase
        .from('invoices')
        .select(`
          *,
          invoice_term:invoice_terms!inner(
            *,
            quotation:quotations!inner(*, client:clients(*), service:services(*))
          ),
          notes_template:notes_templates(*)
        `)
        .order('seq', { ascending: false })
      if (filters?.status)    q = q.eq('status', filters.status)
      if (filters?.companyId) q = q.eq('invoice_term.quotation.company_id', filters.companyId)
      const { data, error } = await q
      if (error) throw error
      return data as Invoice[]
    },
  })

export const useInvoice = (id: string | undefined) =>
  useQuery({
    queryKey: ['invoice', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          invoice_term:invoice_terms(
            *,
            quotation:quotations(*, client:clients(*), service:services(*))
          ),
          notes_template:notes_templates(*)
        `)
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Invoice
    },
  })

export const useGenerateInvoice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoice_term_id: string
      inv_date: string
      due_days: number
      tax_type: TaxType
      notes_template_id: string | null
      custom_notes: string | null
      nominal: number
      service_code: string
      client_code: string
      term_number: number
      existing_invoice_id?: string
    }) => {
      const { data: seqData, error: seqErr } = await supabase.rpc('next_inv_seq')
      if (seqErr) throw seqErr
      const seq: number = seqData

      const invDate = new Date(payload.inv_date)
      const dueDate = new Date(invDate)
      dueDate.setDate(dueDate.getDate() + payload.due_days)

      const inv_number = buildINVNumber(seq, payload.service_code, payload.client_code, payload.term_number, invDate)
      const tax = calcTax(payload.nominal, payload.tax_type)

      if (payload.existing_invoice_id) {
        const { data: existing } = await supabase.from('invoices').select('*').eq('id', payload.existing_invoice_id).single()
        await supabase.from('invoice_edit_logs').insert({
          invoice_id: payload.existing_invoice_id,
          action:     'edited',
          snapshot:   existing,
        })

        const { data, error } = await supabase.from('invoices').update({
          inv_date:          payload.inv_date,
          due_date:          dueDate.toISOString().split('T')[0],
          tax_type:          payload.tax_type,
          subtotal:          tax.subtotal,
          taxable_base:      tax.taxableBase,
          tax_amount:        tax.taxAmount,
          grand_total:       tax.grandTotal,
          notes_template_id: payload.notes_template_id,
          custom_notes:      payload.custom_notes,
          status:            'draft',
          pdf_url:           null,
        }).eq('id', payload.existing_invoice_id).select().single()
        if (error) throw error

        const { data: fullUpdated } = await supabase
          .from('invoices')
          .select('*, invoice_term:invoice_terms(*, quotation:quotations(*, client:clients(*), service:services(*))), notes_template:notes_templates(*)')
          .eq('id', payload.existing_invoice_id)
          .single()
        return (fullUpdated ?? data) as Invoice
      } else {
        const { data, error } = await supabase.from('invoices').insert({
          seq,
          inv_number,
          invoice_term_id:   payload.invoice_term_id,
          inv_date:          payload.inv_date,
          due_date:          dueDate.toISOString().split('T')[0],
          tax_type:          payload.tax_type,
          subtotal:          tax.subtotal,
          taxable_base:      tax.taxableBase,
          tax_amount:        tax.taxAmount,
          grand_total:       tax.grandTotal,
          notes_template_id: payload.notes_template_id,
          custom_notes:      payload.custom_notes,
          status:            'draft',
        }).select().single()
        if (error) throw error

        await supabase.from('invoice_edit_logs').insert({ invoice_id: data.id, action: 'created' })
        await supabase.from('invoice_terms').update({ status: 'waiting' }).eq('id', payload.invoice_term_id)

        const { data: fullNew } = await supabase
          .from('invoices')
          .select('*, invoice_term:invoice_terms(*, quotation:quotations(*, client:clients(*), service:services(*))), notes_template:notes_templates(*)')
          .eq('id', data.id)
          .single()
        return (fullNew ?? data) as Invoice
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoice_terms_all'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useUpdateInvoiceStatus = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, sent_date }: { id: string; status: 'draft' | 'issued' | 'paid' | 'void'; sent_date?: string }) => {
      const updates: Record<string, unknown> = { status }
      if (status === 'issued') {
        updates.issued_at = sent_date
          ? new Date(`${sent_date}T00:00:00`).toISOString()
          : new Date().toISOString()
      }
      const { error } = await supabase.from('invoices').update(updates).eq('id', id)
      if (error) throw error
      const { data: inv } = await supabase.from('invoices').select('invoice_term_id').eq('id', id).single()
      if (inv) {
        const termStatus = status === 'issued' ? 'waiting'
        : status === 'paid'   ? 'paid'
        : status === 'void'   ? 'need_created'  // void = bisa di-generate ulang
        : 'waiting'
        await supabase.from('invoice_terms').update({ status: termStatus }).eq('id', inv.invoice_term_id)
      }
      await supabase.from('invoice_edit_logs').insert({ invoice_id: id, action: status === 'issued' ? 'issued' : status === 'void' ? 'voided' : 'edited' })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoice_terms_all'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useUpdateInvoicePdfUrl = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, pdf_url }: { id: string; pdf_url: string }) => {
      const { error } = await supabase.from('invoices')
        .update({ pdf_url, status: 'issued', issued_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      await supabase.from('invoice_edit_logs').insert({ invoice_id: id, action: 'issued' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

// ============================================================
// PAYMENTS
// ============================================================
// ── UPDATED: terima companyId untuk filter ──
export const usePayments = (companyId?: string | null) =>
  useQuery({
    queryKey: ['payments', companyId],
    queryFn: async () => {
      let q = supabase
        .from('payments')
        .select(`
          *,
          invoice:invoices!inner(
            inv_number, grand_total, status,
            invoice_term:invoice_terms!inner(
              label,
              quotation:quotations!inner(qt_number, company_id, client:clients(name))
            )
          )
        `)
        .order('pay_date', { ascending: false })
      if (companyId) q = q.eq('invoice.invoice_term.quotation.company_id', companyId)
      const { data, error } = await q
      if (error) throw error
      return data as Payment[]
    },
  })

export const useMarkPaid = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoice_id: string
      pay_date: string
      amount: number
      method: string
      reference?: string
      bank_name?: string
      notes?: string
      receipt_url?: string
    }) => {
      const { data, error } = await supabase.from('payments').insert(payload).select().single()
      if (error) throw error

      await supabase.from('invoices').update({ status: 'paid' }).eq('id', payload.invoice_id)
      const { data: inv } = await supabase.from('invoices').select('invoice_term_id').eq('id', payload.invoice_id).single()
      if (inv) await supabase.from('invoice_terms').update({ status: 'paid' }).eq('id', inv.invoice_term_id)

      // Best effort: simpan Receipt PDF saat Mark Paid.
      // Jika gagal generate/upload receipt, proses mark paid tetap berhasil.
      try {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', payload.invoice_id)
          .single()

        if (invoice) {
          const { data: ctx } = await supabase
            .from('invoice_terms')
            .select(`
              label,
              term_number,
              quotations (
                companies (name, address, phone, website, email, logo_url),
                clients (name, address)
              )
            `)
            .eq('id', invoice.invoice_term_id)
            .single()

          if (ctx) {
            const [{ pdf }, { default: FinrokInvoicePDF }] = await Promise.all([
              import('@react-pdf/renderer'),
              import('@/components/shared/InvoicePDF'),
            ])
            const qt = (ctx as any).quotations
            const company = qt?.companies
            const client = qt?.clients
            const receiptData = {
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
              term_label: (ctx as any).label,
              term_number: (ctx as any).term_number,
              subtotal: invoice.subtotal,
              tax_type: invoice.tax_type as 'none' | 'ppn11' | 'ppn12',
              taxable_base: invoice.taxable_base ?? null,
              tax_amount: invoice.tax_amount,
              grand_total: invoice.grand_total,
              notes: null,
              document_title: 'RECEIPT',
              expiration_label: 'Payment Date',
              expiration_date: payload.pay_date,
              show_notes: false,
            }

            const doc = React.createElement(FinrokInvoicePDF, { data: receiptData })
            const blob = await pdf(doc).toBlob()
            const safeInv = String(invoice.inv_number).replace(/[^a-zA-Z0-9._-]/g, '_')
            const filePath = `receipts_pdf/${data.id}_RECEIPT_${safeInv}.pdf`
            await supabase.storage.from('receipts').upload(filePath, blob, { contentType: 'application/pdf', upsert: true })
          }
        }
      } catch (receiptErr) {
        console.error('Failed to auto-save receipt PDF:', receiptErr)
      }

      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoice_terms_all'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ============================================================
// DASHBOARD
// ============================================================
// ── UPDATED: terima companyId untuk filter ──
export const useDashboard = (companyId?: string | null) =>
  useQuery({
    queryKey: ['dashboard', companyId],
    queryFn: async () => {
      const now   = new Date()
      const year  = now.getFullYear()
      const month = now.getMonth() + 1

      // Helper: build quotation subquery for company filter
      const qtDealQuery = async () => {
        let q = supabase.from('quotations').select('id', { count: 'exact' }).eq('status', 'deal')
        if (companyId) q = q.eq('company_id', companyId)
        return q
      }

      // For invoice-based queries, need to go through invoice_terms → quotations
      const invWaitingQuery = async () => {
        if (!companyId) {
          return supabase.from('invoices').select('id', { count: 'exact' }).eq('status', 'issued')
        }
        // Get invoice_term_ids for this company
        const { data: terms } = await supabase
          .from('invoice_terms')
          .select('id')
          .eq('quotation.company_id', companyId)
          .not('quotation', 'is', null)
        const termIds = (terms ?? []).map((t: any) => t.id)
        if (termIds.length === 0) return { count: 0 }
        return supabase.from('invoices').select('id', { count: 'exact' })
          .eq('status', 'issued')
          .in('invoice_term_id', termIds)
      }

      const needCreatedQuery = async () => {
        if (!companyId) {
          return supabase.from('invoice_terms').select('id', { count: 'exact' }).eq('status', 'need_created')
        }
        let q = supabase
          .from('invoice_terms')
          .select('id, quotation:quotations!inner(company_id)', { count: 'exact' })
          .eq('status', 'need_created')
          .eq('quotation.company_id', companyId)
        return q
      }

      const [qtDeals, invWaiting, paidMonthRes, forecastMonthRes, needCreatedRes, monthlyIncomeRes, monthlyForecastRes] =
        await Promise.all([
          qtDealQuery(),
          invWaitingQuery(),
          // v_monthly_income now has company_id
          (() => {
            let q = supabase.from('v_monthly_income').select('total_paid').eq('year', year).eq('month', month)
            if (companyId) q = q.eq('company_id', companyId)
            return q
          })(),
          // v_monthly_forecast now has company_id
          (() => {
            let q = supabase.from('v_monthly_forecast').select('forecast_amount').eq('year', year).eq('month', month)
            if (companyId) q = q.eq('company_id', companyId)
            return q
          })(),
          needCreatedQuery(),
          (() => {
            let q = supabase.from('v_monthly_income').select('*').eq('year', year).order('month')
            if (companyId) q = q.eq('company_id', companyId)
            return q
          })(),
          (() => {
            let q = supabase.from('v_monthly_forecast').select('*').eq('year', year).order('month')
            if (companyId) q = q.eq('company_id', companyId)
            return q
          })(),
        ])

      // v_monthly_income may return multiple rows per month (per company), sum them
      const paidThisMonth = Array.isArray(paidMonthRes.data)
        ? (paidMonthRes.data as any[]).reduce((s, r) => s + (r.total_paid ?? 0), 0)
        : (paidMonthRes as any).data?.total_paid ?? 0

      const forecastThisMonth = Array.isArray(forecastMonthRes.data)
        ? (forecastMonthRes.data as any[]).reduce((s, r) => s + (r.forecast_amount ?? 0), 0)
        : (forecastMonthRes as any).data?.forecast_amount ?? 0

      return {
        qt_deal_total:       qtDeals.count ?? 0,
        inv_waiting_count:   invWaiting.count ?? 0,
        paid_this_month:     paidThisMonth,
        forecast_this_month: forecastThisMonth,
        overdue_count:       0, // overdue needs separate handling
        need_created_count:  needCreatedRes.count ?? 0,
        monthly_income:      (monthlyIncomeRes.data ?? []) as MonthlyIncome[],
        monthly_forecast:    (monthlyForecastRes.data ?? []) as MonthlyForecast[],
      }
    },
  })

export const useRefreshOverdue = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('refresh_overdue_status')
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoice_terms_all'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
