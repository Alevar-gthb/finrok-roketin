import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────

export interface Project {
  id: string
  code: string
  name: string
  status: 'planning' | 'active' | 'completed' | 'on_hold' | 'cancelled'
  start_date: string | null
  end_date: string | null
  estimated_capital: number | null
  budget: number | null
  budget_pct: number | null
  company_id: string | null
  description: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ProjectSummary extends Project {
  // dari quotations linked
  total_quotation_nominal: number
  quotation_count: number
  client_names: string
  // dari invoice_terms
  total_income_forecast: number
  total_income_paid: number
  // dari expenses
  total_manpower: number
  total_other_expenses: number
  total_expense: number
}

export interface ManpowerCost {
  id: string
  project_id: string
  person_name: string
  role: string | null
  rate: number
  months: number
  total_cost: number
  notes: string | null
  created_at: string
}

export type ExpenseCategory = 'transport' | 'accommodation' | 'tools_license' | 'operational' | 'entertainment' | 'other'

export interface OtherExpense {
  id: string
  project_id: string
  category: ExpenseCategory
  description: string
  amount: number
  expense_date: string
  receipt_url: string | null
  notes: string | null
  created_at: string
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  transport:       'Transport',
  accommodation:   'Akomodasi',
  tools_license:   'Tools & Lisensi',
  operational:     'Operasional',
  entertainment:   'Entertainment',
  other:           'Lainnya',
}

// ─── Projects ────────────────────────────────────────────────

export async function getProjects(companyId?: string | null): Promise<ProjectSummary[]> {
  // Fetch projects dengan aggregasi dari quotations dan expenses
  let query = supabase
    .from('projects')
    .select(`
      *,
      quotations (
        id, nominal, company_id,
        clients (name),
        invoice_terms (
          nominal, status,
          invoices (status, grand_total,
            payments (amount)
          )
        )
      ),
      project_manpower_costs (total_cost),
      project_other_expenses (amount)
    `)
    .order('created_at', { ascending: false })

  if (companyId) {
    query = query.eq('company_id', companyId)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map(p => {
    const quotations = (p.quotations as any[]) ?? []
    const total_quotation_nominal = quotations.reduce((s: number, q: any) => s + (q.nominal ?? 0), 0)
    const client_names = [...new Set(quotations.map((q: any) => q.clients?.name).filter(Boolean))].join(', ')

    const allTerms = quotations.flatMap((q: any) => q.invoice_terms ?? [])
    const total_income_forecast = allTerms.reduce((s: number, t: any) => s + (t.nominal ?? 0), 0)
    const total_income_paid = allTerms
      .filter((t: any) => t.status === 'paid')
      .reduce((s: number, t: any) => s + (t.nominal ?? 0), 0)

    const total_manpower = ((p.project_manpower_costs as any[]) ?? [])
      .reduce((s: number, m: any) => s + (m.total_cost ?? 0), 0)
    const total_other_expenses = ((p.project_other_expenses as any[]) ?? [])
      .reduce((s: number, e: any) => s + (e.amount ?? 0), 0)

    return {
      ...p,
      total_quotation_nominal,
      quotation_count: quotations.length,
      client_names,
      total_income_forecast,
      total_income_paid,
      total_manpower,
      total_other_expenses,
      total_expense: total_manpower + total_other_expenses,
    } as ProjectSummary
  })
}

export async function getProject(id: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Project
}

export async function createProject(payload: {
  name: string
  code: string
  start_date?: string
  end_date?: string
  budget?: number
  budget_pct?: number
  company_id?: string
  description?: string
  notes?: string
  status?: string
}): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert({ ...payload, status: payload.status ?? 'active' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProject(id: string, payload: Partial<Project>): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Link quotation ke project
export async function linkQuotationToProject(quotationId: string, projectId: string) {
  const { error } = await supabase
    .from('quotations')
    .update({ project_id: projectId })
    .eq('id', quotationId)
  if (error) throw error
}

// Unlink quotation dari project
export async function unlinkQuotationFromProject(quotationId: string) {
  const { error } = await supabase
    .from('quotations')
    .update({ project_id: null })
    .eq('id', quotationId)
  if (error) throw error
}

// Fetch quotations untuk project tertentu
export async function getProjectQuotations(projectId: string) {
  const { data, error } = await supabase
    .from('quotations')
    .select(`
      id, qt_number, nominal, status, qt_date, title, company_id,
      clients (name, code),
      services (code, name),
      invoice_terms (id, term_number, label, nominal, status, est_date)
    `)
    .eq('project_id', projectId)
    .order('qt_date')
  if (error) throw error
  return data ?? []
}

// Fetch deal quotations yang belum linked ke project (untuk dropdown saat buat project baru)
export async function getAvailableDealQuotations(companyId?: string | null) {
  let query = supabase
    .from('quotations')
    .select(`
      id, qt_number, nominal, title, qt_date, company_id,
      clients (name),
      services (code)
    `)
    .eq('status', 'deal')
    .is('project_id', null)
    .order('qt_date', { ascending: false })

  if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

// ─── Manpower ────────────────────────────────────────────────

export async function getManpowerCosts(projectId: string): Promise<ManpowerCost[]> {
  const { data, error } = await supabase
    .from('project_manpower_costs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export async function createManpowerCost(payload: {
  project_id: string
  person_name: string
  role?: string
  rate: number
  months: number
  notes?: string
}): Promise<ManpowerCost> {
  const { data, error } = await supabase
    .from('project_manpower_costs')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateManpowerCost(id: string, payload: Partial<ManpowerCost>): Promise<ManpowerCost> {
  const { data, error } = await supabase
    .from('project_manpower_costs')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteManpowerCost(id: string) {
  const { error } = await supabase.from('project_manpower_costs').delete().eq('id', id)
  if (error) throw error
}

// ─── Other Expenses ──────────────────────────────────────────

export async function getOtherExpenses(projectId: string): Promise<OtherExpense[]> {
  const { data, error } = await supabase
    .from('project_other_expenses')
    .select('*')
    .eq('project_id', projectId)
    .order('expense_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createOtherExpense(payload: {
  project_id: string
  category: ExpenseCategory
  description: string
  amount: number
  expense_date: string
  receipt_url?: string
  notes?: string
}): Promise<OtherExpense> {
  const { data, error } = await supabase
    .from('project_other_expenses')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateOtherExpense(id: string, payload: Partial<OtherExpense>): Promise<OtherExpense> {
  const { data, error } = await supabase
    .from('project_other_expenses')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteOtherExpense(id: string) {
  const { error } = await supabase.from('project_other_expenses').delete().eq('id', id)
  if (error) throw error
}

// ─── Auto-generate project code ──────────────────────────────

export function generateProjectCode(): string {
  const year = new Date().getFullYear().toString().slice(-2)
  const rand = Math.floor(Math.random() * 900 + 100)
  return `PRJ-${year}${rand}`
}
