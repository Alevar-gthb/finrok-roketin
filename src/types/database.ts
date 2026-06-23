// ============================================================
// Finrok — TypeScript types mirroring Supabase schema
// ============================================================

export type QTStatus  = 'draft' | 'sent' | 'deal' | 'lost'
export type InvTermStatus = 'not_yet' | 'need_created' | 'waiting' | 'paid' | 'overdue'
export type InvDocStatus  = 'draft' | 'issued' | 'paid' | 'overdue' | 'void'
export type TaxType   = 'none' | 'ppn11' | 'ppn12'
export type PayMethod = 'transfer' | 'cash' | 'giro' | 'other'
export type ManpowerType = 'employee' | 'freelance' | 'vendor'
export type RateUnit  = 'daily' | 'weekly' | 'monthly' | 'fixed'
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'on_hold' | 'cancelled'
export type ExpenseCategory = 'salary' | 'travel' | 'infrastructure' | 'tools_license' | 'operational' | 'entertainment' | 'tax' | 'fixed_cost' | 'variable_cost' | 'other'

// Master Data
export interface Service {
  id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  code: string
  name: string
  pic_name: string | null
  address: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  email: string | null
  phone: string | null
  npwp: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NotesTemplate {
  id: string
  code: string
  name: string
  content: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// Quotation
export interface Quotation {
  id: string
  seq: number
  qt_number: string
  qt_date: string
  client_id: string
  service_id: string
  project_id: string | null
  title: string
  nominal: number
  status: QTStatus
  lost_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined
  client?: Client
  service?: Service
}

export interface QuotationStatusLog {
  id: string
  quotation_id: string
  from_status: string | null
  to_status: string
  notes: string | null
  changed_at: string
}

// Invoice Term
export interface InvoiceTerm {
  id: string
  quotation_id: string
  term_number: number
  total_terms: number
  label: string
  nominal: number
  est_date: string | null
  status: InvTermStatus
  created_at: string
  updated_at: string
  // joined
  quotation?: Quotation
  invoice?: Invoice
}

// Line item di dalam satu invoice (qty × unit_price = total baris)
export interface InvoiceLineItem {
  description: string
  qty: number
  unit_price: number
}

// Invoice document
export interface Invoice {
  id: string
  seq: number
  inv_number: string
  invoice_term_id: string
  inv_date: string
  due_date: string
  tax_type: TaxType
  subtotal: number
  taxable_base: number | null
  tax_amount: number
  grand_total: number
  line_items: InvoiceLineItem[] | null
  notes_template_id: string | null
  custom_notes: string | null
  pdf_url: string | null
  status: InvDocStatus
  issued_at: string | null
  created_at: string
  updated_at: string
  // joined
  invoice_term?: InvoiceTerm & { quotation?: Quotation & { client?: Client; service?: Service } }
  notes_template?: NotesTemplate
}

export interface InvoiceEditLog {
  id: string
  invoice_id: string
  action: 'created' | 'edited' | 'regenerated' | 'issued' | 'voided'
  snapshot: Record<string, unknown> | null
  notes: string | null
  changed_at: string
}

// Payment
export interface Payment {
  id: string
  invoice_id: string
  pay_date: string
  amount: number
  method: PayMethod
  reference: string | null
  bank_name: string | null
  receipt_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined
  invoice?: Invoice
}

// Project (v2 fondasi)
export interface Project {
  id: string
  code: string
  name: string
  client_id: string | null
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
  description: string | null
  estimated_capital: number | null
  notes: string | null
  created_at: string
  updated_at: string
  client?: Client
}

// Manpower (v2 fondasi)
export interface Manpower {
  id: string
  name: string
  role: string | null
  type: ManpowerType
  rate: number | null
  rate_unit: RateUnit
  email: string | null
  phone: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

// Expense (v2 fondasi)
export interface Expense {
  id: string
  project_id: string | null
  category: ExpenseCategory
  description: string
  amount: number
  expense_date: string
  vendor: string | null
  reference: string | null
  receipt_url: string | null
  is_recurring: boolean
  recurring_note: string | null
  notes: string | null
  created_at: string
  updated_at: string
  project?: Project
}

// View types
export interface QuotationSummary {
  id: string
  qt_number: string
  qt_date: string
  title: string
  nominal: number
  qt_status: QTStatus
  client_name: string
  client_code: string
  service_code: string
  service_name: string
  project_name: string | null
  total_terms: number
  paid_terms: number
  total_paid: number
  total_outstanding: number
}

export interface MonthlyIncome {
  year: number
  month: number
  invoice_count: number
  total_paid: number
}

export interface MonthlyForecast {
  year: number
  month: number
  term_count: number
  forecast_amount: number
}

// Dashboard cards
export interface DashboardStats {
  qt_deal_total: number
  inv_waiting_count: number
  paid_this_month: number
  forecast_this_month: number
  overdue_count: number
  need_created_count: number
}

// Supabase Database type stub (will be auto-generated by supabase CLI in real project)
export interface Database {
  public: {
    Tables: {
      clients:           { Row: Client;        Insert: Omit<Client, 'id'|'created_at'|'updated_at'>; Update: Partial<Client> }
      services:          { Row: Service;       Insert: Omit<Service, 'id'|'created_at'|'updated_at'>; Update: Partial<Service> }
      notes_templates:   { Row: NotesTemplate; Insert: Omit<NotesTemplate, 'id'|'created_at'|'updated_at'>; Update: Partial<NotesTemplate> }
      quotations:        { Row: Quotation;     Insert: Omit<Quotation, 'id'|'created_at'|'updated_at'>; Update: Partial<Quotation> }
      invoice_terms:     { Row: InvoiceTerm;   Insert: Omit<InvoiceTerm, 'id'|'created_at'|'updated_at'>; Update: Partial<InvoiceTerm> }
      invoices:          { Row: Invoice;       Insert: Omit<Invoice, 'id'|'created_at'|'updated_at'>; Update: Partial<Invoice> }
      payments:          { Row: Payment;       Insert: Omit<Payment, 'id'|'created_at'|'updated_at'>; Update: Partial<Payment> }
      projects:          { Row: Project;       Insert: Omit<Project, 'id'|'created_at'|'updated_at'>; Update: Partial<Project> }
      manpower:          { Row: Manpower;      Insert: Omit<Manpower, 'id'|'created_at'|'updated_at'>; Update: Partial<Manpower> }
      expenses:          { Row: Expense;       Insert: Omit<Expense, 'id'|'created_at'|'updated_at'>; Update: Partial<Expense> }
      qt_sequence:       { Row: { id: number; last_seq: number }; Insert: never; Update: never }
      inv_sequence:      { Row: { id: number; last_seq: number }; Insert: never; Update: never }
    }
    Views: {
      v_quotation_summary: { Row: QuotationSummary }
      v_monthly_income:    { Row: MonthlyIncome }
      v_monthly_forecast:  { Row: MonthlyForecast }
    }
  }
}
