import { useState } from 'react'
import { useParams, useNavigate, NavLink } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProject, updateProject, getProjectQuotations,
  getManpowerCosts, createManpowerCost, deleteManpowerCost,
  getOtherExpenses, createOtherExpense, deleteOtherExpense,
  linkQuotationToProject, unlinkQuotationFromProject,
  getAvailableDealQuotations, EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from '@/services/projectService'
import { useCompanyStore } from '@/store/useCompanyStore'
import {
  Button, Input, Select, Modal, LoadingSpinner, Amount,
} from '@/components/shared'
import { formatRp, formatDate } from '@/lib/utils'
import {
  ArrowLeft, Calendar, TrendingUp, Receipt, Users,
  Plus, Trash2, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'

const TABS = [
  { key: 'timeline', label: 'Timeline & Forecast', icon: Calendar },
  { key: 'income',   label: 'Income',              icon: TrendingUp },
  { key: 'expense',  label: 'Expense',             icon: Receipt },
]

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('timeline')

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  })

  if (isLoading) return <LoadingSpinner />
  if (!project) return <p className="p-6 text-muted-foreground">Project tidak ditemukan.</p>

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/projects')}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              project.status === 'active' ? 'bg-green-100 text-green-700' :
              project.status === 'completed' ? 'bg-slate-100 text-slate-600' :
              'bg-amber-100 text-amber-700'
            }`}>
              {project.status}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">{project.name}</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-rok-600 text-rok-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'timeline' && <TimelineTab project={project} />}
      {activeTab === 'income'   && <IncomeTab projectId={id!} />}
      {activeTab === 'expense'  && <ExpenseTab projectId={id!} project={project} />}
    </div>
  )
}

// ─── Timeline Tab ─────────────────────────────────────────────
function TimelineTab({ project }: { project: any }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    start_date:  project.start_date ?? '',
    end_date:    project.end_date ?? '',
    budget_pct:  String(project.budget_pct ?? 100),
    status:      project.status,
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Fetch quotations untuk hitung income
  const { data: quotations = [] } = useQuery({
    queryKey: ['project-quotations', project.id],
    queryFn: () => getProjectQuotations(project.id),
  })

  // Fetch expenses
  const { data: manpower = [] } = useQuery({
    queryKey: ['project-manpower', project.id],
    queryFn: () => getManpowerCosts(project.id),
  })
  const { data: otherExp = [] } = useQuery({
    queryKey: ['project-other-expenses', project.id],
    queryFn: () => getOtherExpenses(project.id),
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      const total_quotation_nominal = (quotations as any[]).reduce((s: number, q: any) => s + (q.nominal ?? 0), 0)
      const budget_pct = parseFloat(form.budget_pct) || 100
      const budget = total_quotation_nominal * budget_pct / 100
      return updateProject(project.id, {
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        budget_pct,
        budget,
        status: form.status,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project.id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setEditing(false)
    },
  })

  // Kalkulasi
  const allTerms = (quotations as any[]).flatMap((q: any) => q.invoice_terms ?? [])
  const total_income_forecast = allTerms.reduce((s: number, t: any) => s + (t.nominal ?? 0), 0)
  const total_income_paid     = allTerms.filter((t: any) => t.status === 'paid').reduce((s: number, t: any) => s + (t.nominal ?? 0), 0)
  const total_manpower        = (manpower as any[]).reduce((s: number, m: any) => s + (m.total_cost ?? 0), 0)
  const total_other           = (otherExp as any[]).reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
  const total_expense         = total_manpower + total_other
  const total_quotation       = (quotations as any[]).reduce((s: number, q: any) => s + (q.nominal ?? 0), 0)
  const budget                = project.budget ?? total_quotation
  const est_profit            = total_income_forecast - total_expense
  const cashflow_needed       = total_expense - total_income_paid
  const isOverBudget          = project.budget && total_expense > project.budget

  return (
    <div className="space-y-4 max-w-2xl">

      {/* Timeline settings */}
      <div className="rounded-lg border border-border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Timeline Project</p>
          {!editing
            ? <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            : <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Batal</Button>
                <Button size="sm" onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>Simpan</Button>
              </div>
          }
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start Date" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              <Input label="End Date (estimasi)" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
            <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Budget (% dari total QT)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="100"
                  className="w-24 px-2 py-1.5 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-rok-400"
                  value={form.budget_pct}
                  onChange={e => set('budget_pct', e.target.value)}
                />
                <span className="text-xs text-muted-foreground">%</span>
                <span className="text-xs text-muted-foreground">→ Budget: {formatRp(total_quotation * parseFloat(form.budget_pct || '100') / 100)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground">Mulai</p>
              <p className="font-medium">{project.start_date ? formatDate(project.start_date) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Estimasi Selesai</p>
              <p className="font-medium">{project.end_date ? formatDate(project.end_date) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Status</p>
              <p className="font-medium capitalize">{project.status}</p>
            </div>
          </div>
        )}
      </div>

      {/* Budget */}
      <div className="rounded-lg border border-border bg-white p-4">
        <p className="text-sm font-semibold mb-3">Budget</p>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Total QT Linked</span>
          <span className="text-sm font-medium">{formatRp(total_quotation)}</span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">Budget ({project.budget_pct ?? 100}%)</span>
          <span className="text-sm font-bold text-rok-700">{formatRp(budget)}</span>
        </div>
        {/* Progress */}
        <div className="w-full bg-secondary rounded-full h-2 mb-1">
          <div
            className={`h-2 rounded-full ${isOverBudget ? 'bg-red-500' : total_expense / budget > 0.8 ? 'bg-amber-500' : 'bg-rok-500'}`}
            style={{ width: `${Math.min((total_expense / budget) * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Expense: {formatRp(total_expense, { short: true })}</span>
          <span>{Math.round((total_expense / budget) * 100)}% dari budget</span>
        </div>
        {isOverBudget && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-md p-2">
            <AlertTriangle size={12} />
            <span>⚠️ Expense melebihi budget sebesar {formatRp(total_expense - budget)}</span>
          </div>
        )}
      </div>

      {/* Profit Forecast */}
      <div className="rounded-lg border border-border bg-white p-4">
        <p className="text-sm font-semibold mb-3">Profit Forecast</p>
        <div className="space-y-2">
          {[
            { label: 'Total Income (forecast)',   value: total_income_forecast,  color: '' },
            { label: 'Total Income (actual paid)', value: total_income_paid,     color: 'text-green-700' },
            { label: 'Total Expense (actual)',     value: total_expense,          color: 'text-red-600' },
          ].map(row => (
            <div key={row.label} className="flex justify-between text-sm border-b border-border pb-2">
              <span className="text-muted-foreground">{row.label}</span>
              <span className={`font-medium ${row.color}`}>{formatRp(row.value)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold pt-1">
            <span>Estimated Profit</span>
            <span className={est_profit >= 0 ? 'text-green-700' : 'text-red-600'}>
              {formatRp(est_profit)} ({total_income_forecast > 0 ? Math.round(est_profit / total_income_forecast * 100) : 0}%)
            </span>
          </div>
          <div className="flex justify-between text-sm border-t border-border pt-2">
            <span className="text-muted-foreground">Cashflow dibutuhkan</span>
            <span className={`font-semibold ${cashflow_needed > 0 ? 'text-amber-700' : 'text-green-700'}`}>
              {cashflow_needed > 0 ? formatRp(cashflow_needed) : '✓ Surplus'}
            </span>
          </div>
        </div>
      </div>

      {/* Linked quotations */}
      <LinkedQuotationsSection projectId={project.id} />
    </div>
  )
}

// ─── Linked Quotations ────────────────────────────────────────
function LinkedQuotationsSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { selectedCompanyId } = useCompanyStore()
  const [showAdd, setShowAdd] = useState(false)
  const [selectedQT, setSelectedQT] = useState('')

  const { data: quotations = [] } = useQuery({
    queryKey: ['project-quotations', projectId],
    queryFn: () => getProjectQuotations(projectId),
  })

  const { data: availableQTs = [] } = useQuery({
    queryKey: ['available-deal-quotations', selectedCompanyId],
    queryFn: () => getAvailableDealQuotations(selectedCompanyId),
    enabled: showAdd,
  })

  const linkMutation = useMutation({
    mutationFn: () => linkQuotationToProject(selectedQT, projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-quotations', projectId] })
      qc.invalidateQueries({ queryKey: ['available-deal-quotations'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setShowAdd(false)
      setSelectedQT('')
    },
  })

  const unlinkMutation = useMutation({
    mutationFn: unlinkQuotationFromProject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-quotations', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Quotation Terhubung ({quotations.length})</p>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(v => !v)}>
          <Plus size={12} /> Link QT
        </Button>
      </div>

      {showAdd && (
        <div className="mb-3 p-3 rounded-lg border border-rok-200 bg-rok-50/30 space-y-2">
          <Select label="Pilih Quotation Deal" value={selectedQT} onChange={e => setSelectedQT(e.target.value)}>
            <option value="">Pilih...</option>
            {availableQTs.map(q => (
              <option key={q.id} value={q.id}>
                {q.qt_number} — {(q as any).clients?.name} — {formatRp(q.nominal ?? 0, { short: true })}
              </option>
            ))}
          </Select>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Batal</Button>
            <Button size="sm" onClick={() => linkMutation.mutate()} disabled={!selectedQT} loading={linkMutation.isPending}>
              Link
            </Button>
          </div>
        </div>
      )}

      {quotations.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Belum ada quotation terhubung.</p>
      ) : (
        <div className="space-y-1.5">
          {(quotations as any[]).map((q: any) => (
            <div key={q.id} className="flex items-center justify-between p-2 rounded border border-border bg-secondary/20">
              <div>
                <p className="text-xs font-medium">{q.qt_number}</p>
                <p className="text-[11px] text-muted-foreground">{q.clients?.name} · {formatRp(q.nominal)}</p>
              </div>
              <button
                onClick={() => { if (confirm('Putuskan link quotation ini?')) unlinkMutation.mutate(q.id) }}
                className="text-muted-foreground hover:text-red-500 transition-colors p-1"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Income Tab ───────────────────────────────────────────────
function IncomeTab({ projectId }: { projectId: string }) {
  const { data: quotations = [], isLoading } = useQuery({
    queryKey: ['project-quotations', projectId],
    queryFn: () => getProjectQuotations(projectId),
  })

  if (isLoading) return <LoadingSpinner />

  const allTerms = (quotations as any[]).flatMap((q: any) =>
    (q.invoice_terms ?? []).map((t: any) => ({ ...t, qt_number: q.qt_number, client: q.clients?.name }))
  )

  const STATUS_STYLE: Record<string, string> = {
    paid:         'bg-green-100 text-green-700',
    waiting:      'bg-blue-100 text-blue-700',
    need_created: 'bg-amber-100 text-amber-700',
    not_yet:      'bg-slate-100 text-slate-600',
    overdue:      'bg-red-100 text-red-600',
  }

  const totalForecast = allTerms.reduce((s: number, t: any) => s + t.nominal, 0)
  const totalPaid = allTerms.filter((t: any) => t.status === 'paid').reduce((s: number, t: any) => s + t.nominal, 0)

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Income Forecast', value: totalForecast, color: '' },
          { label: 'Sudah Dibayar', value: totalPaid, color: 'text-green-700' },
          { label: 'Belum Dibayar', value: totalForecast - totalPaid, color: 'text-amber-700' },
        ].map(card => (
          <div key={card.label} className="rounded-lg border border-border bg-white p-3">
            <p className="text-[10px] text-muted-foreground">{card.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${card.color}`}>{formatRp(card.value, { short: true })}</p>
          </div>
        ))}
      </div>

      {/* Terms list */}
      <div className="rounded-lg border border-border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/40 border-b border-border">
              {['QT', 'Label', 'Est. Date', 'Nominal', 'Status'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allTerms.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">Belum ada termin.</td></tr>
            ) : (
              allTerms.map((t: any) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{t.qt_number}</td>
                  <td className="px-4 py-3 text-xs">{t.label}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{t.est_date ? formatDate(t.est_date) : '—'}</td>
                  <td className="px-4 py-3 text-xs font-medium">{formatRp(t.nominal)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[t.status] ?? ''}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Expense Tab ──────────────────────────────────────────────
function ExpenseTab({ projectId, project }: { projectId: string; project: any }) {
  const qc = useQueryClient()
  const [expTab, setExpTab] = useState<'manpower' | 'other'>('manpower')
  const [showAddManpower, setShowAddManpower] = useState(false)
  const [showAddOther, setShowAddOther] = useState(false)

  const { data: manpower = [], isLoading: mpLoading } = useQuery({
    queryKey: ['project-manpower', projectId],
    queryFn: () => getManpowerCosts(projectId),
  })
  const { data: otherExp = [], isLoading: otherLoading } = useQuery({
    queryKey: ['project-other-expenses', projectId],
    queryFn: () => getOtherExpenses(projectId),
  })

  const totalManpower = manpower.reduce((s, m) => s + m.total_cost, 0)
  const totalOther    = otherExp.reduce((s, e) => s + e.amount, 0)
  const totalExpense  = totalManpower + totalOther
  const budget        = project.budget
  const isOverBudget  = budget && totalExpense > budget

  const deleteManpower = useMutation({
    mutationFn: deleteManpowerCost,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-manpower', projectId] }),
  })
  const deleteOther = useMutation({
    mutationFn: deleteOtherExpense,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-other-expenses', projectId] }),
  })

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Manpower', value: totalManpower, color: '' },
          { label: 'Total Lainnya',  value: totalOther,    color: '' },
          { label: 'Total Expense',  value: totalExpense,  color: isOverBudget ? 'text-red-600' : '' },
        ].map(card => (
          <div key={card.label} className={`rounded-lg border bg-white p-3 ${isOverBudget && card.label === 'Total Expense' ? 'border-red-200' : 'border-border'}`}>
            <p className="text-[10px] text-muted-foreground">{card.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${card.color}`}>{formatRp(card.value, { short: true })}</p>
          </div>
        ))}
      </div>

      {isOverBudget && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle size={14} />
          <span>⚠️ Total expense melebihi budget sebesar <strong>{formatRp(totalExpense - budget)}</strong></span>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        {[
          { key: 'manpower', label: `Manpower (${manpower.length})`, icon: Users },
          { key: 'other',    label: `Lainnya (${otherExp.length})`,  icon: Receipt },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setExpTab(t.key as any)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              expTab === t.key ? 'border-rok-600 text-rok-700' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {/* Manpower list */}
      {expTab === 'manpower' && (
        <div>
          <div className="flex justify-end mb-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddManpower(true)}>
              <Plus size={12} /> Tambah
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  {['Nama', 'Role', 'Rate/bln', 'Bulan', 'Total', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {manpower.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">Belum ada manpower.</td></tr>
                ) : (
                  manpower.map(m => (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                      <td className="px-4 py-3 text-xs font-medium">{m.person_name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{m.role || '—'}</td>
                      <td className="px-4 py-3 text-xs">{formatRp(m.rate, { short: true })}</td>
                      <td className="px-4 py-3 text-xs">{m.months} bln</td>
                      <td className="px-4 py-3 text-xs font-semibold">{formatRp(m.total_cost, { short: true })}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { if (confirm('Hapus manpower ini?')) deleteManpower.mutate(m.id) }}
                          className="text-muted-foreground hover:text-red-500 p-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
                {manpower.length > 0 && (
                  <tr className="bg-secondary/30">
                    <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-right">Total Manpower</td>
                    <td colSpan={2} className="px-4 py-2 text-xs font-bold">{formatRp(totalManpower)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Other expenses list */}
      {expTab === 'other' && (
        <div>
          <div className="flex justify-end mb-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddOther(true)}>
              <Plus size={12} /> Tambah
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  {['Tanggal', 'Kategori', 'Deskripsi', 'Amount', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {otherExp.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">Belum ada expense lainnya.</td></tr>
                ) : (
                  otherExp.map(e => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(e.expense_date)}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] bg-secondary px-2 py-0.5 rounded font-medium">
                          {EXPENSE_CATEGORY_LABELS[e.category]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[160px] truncate">{e.description}</td>
                      <td className="px-4 py-3 text-xs font-medium">{formatRp(e.amount, { short: true })}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { if (confirm('Hapus expense ini?')) deleteOther.mutate(e.id) }}
                          className="text-muted-foreground hover:text-red-500 p-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
                {otherExp.length > 0 && (
                  <tr className="bg-secondary/30">
                    <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-right">Total Lainnya</td>
                    <td colSpan={2} className="px-4 py-2 text-xs font-bold">{formatRp(totalOther)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Manpower Modal */}
      {showAddManpower && (
        <AddManpowerModal
          projectId={projectId}
          onClose={() => setShowAddManpower(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['project-manpower', projectId] })
            qc.invalidateQueries({ queryKey: ['projects'] })
            setShowAddManpower(false)
          }}
        />
      )}

      {/* Add Other Expense Modal */}
      {showAddOther && (
        <AddOtherExpenseModal
          projectId={projectId}
          onClose={() => setShowAddOther(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['project-other-expenses', projectId] })
            qc.invalidateQueries({ queryKey: ['projects'] })
            setShowAddOther(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Add Manpower Modal ───────────────────────────────────────
function AddManpowerModal({ projectId, onClose, onSuccess }: any) {
  const [form, setForm] = useState({ person_name: '', role: '', rate: '', months: '1', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => createManpowerCost({
      project_id:  projectId,
      person_name: form.person_name,
      role:        form.role || undefined,
      rate:        parseFloat(form.rate),
      months:      parseFloat(form.months),
      notes:       form.notes || undefined,
    }),
    onSuccess,
  })

  const total = parseFloat(form.rate || '0') * parseFloat(form.months || '0')

  return (
    <Modal open onClose={onClose} title="Tambah Manpower" width="max-w-sm">
      <div className="space-y-3">
        <Input label="Nama *" value={form.person_name} onChange={e => set('person_name', e.target.value)} />
        <Input label="Role / Posisi" value={form.role} onChange={e => set('role', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Rate / Bulan (Rp) *" type="number" value={form.rate} onChange={e => set('rate', e.target.value)} />
          <Input label="Durasi (bulan) *" type="number" min="0.5" step="0.5" value={form.months} onChange={e => set('months', e.target.value)} />
        </div>
        {total > 0 && (
          <div className="bg-rok-50 rounded-md p-2.5 text-xs text-center">
            Total: <strong className="text-rok-700">{formatRp(total)}</strong>
          </div>
        )}
        <Input label="Catatan (opsional)" value={form.notes} onChange={e => set('notes', e.target.value)} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!form.person_name || !form.rate || !form.months}>
            Simpan
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Add Other Expense Modal ──────────────────────────────────
function AddOtherExpenseModal({ projectId, onClose, onSuccess }: any) {
  const [form, setForm] = useState({
    category:     'transport' as ExpenseCategory,
    description:  '',
    amount:       '',
    expense_date: new Date().toISOString().split('T')[0],
    notes:        '',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => createOtherExpense({
      project_id:   projectId,
      category:     form.category,
      description:  form.description,
      amount:       parseFloat(form.amount),
      expense_date: form.expense_date,
      notes:        form.notes || undefined,
    }),
    onSuccess,
  })

  return (
    <Modal open onClose={onClose} title="Tambah Expense" width="max-w-sm">
      <div className="space-y-3">
        <Select label="Kategori *" value={form.category} onChange={e => set('category', e.target.value)}>
          {Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </Select>
        <Input label="Deskripsi *" value={form.description} onChange={e => set('description', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Amount (Rp) *" type="number" value={form.amount} onChange={e => set('amount', e.target.value)} />
          <Input label="Tanggal *" type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} />
        </div>
        <Input label="Catatan (opsional)" value={form.notes} onChange={e => set('notes', e.target.value)} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!form.description || !form.amount}>
            Simpan
          </Button>
        </div>
      </div>
    </Modal>
  )
}
