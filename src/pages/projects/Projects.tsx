import { useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProjects, createProject, linkQuotationToProject,
  getAvailableDealQuotations, generateProjectCode,
  type ProjectSummary,
} from '@/services/projectService'
import { useCompanyStore } from '@/store/useCompanyStore'
import {
  PageHeader, Button, Input, Select, Modal, EmptyState, LoadingSpinner, Amount,
} from '@/components/shared'
import { formatRp, formatDate } from '@/lib/utils'
import { Plus, FolderKanban, AlertTriangle, ChevronRight } from 'lucide-react'
import ProjectDetail from './ProjectDetail'

export default function Projects() {
  return (
    <Routes>
      <Route index element={<ProjectList />} />
      <Route path=":id/*" element={<ProjectDetail />} />
    </Routes>
  )
}

const STATUS_CONFIG = {
  planning:  { label: 'Planning',  color: 'bg-blue-100 text-blue-700'   },
  active:    { label: 'Active',    color: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', color: 'bg-slate-100 text-slate-600' },
  on_hold:   { label: 'On Hold',   color: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-600'     },
}

// ─── Project List ─────────────────────────────────────────────
function ProjectList() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { selectedCompanyId } = useCompanyStore()
  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', selectedCompanyId],
    queryFn: () => getProjects(selectedCompanyId),
  })

  const filtered = filterStatus === 'all'
    ? projects
    : projects.filter(p => p.status === filterStatus)

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="page">
      <PageHeader
        title="Projects"
        sub={`${filtered.length} project ditemukan`}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Buat Project
          </Button>
        }
      />

      <div className="flex items-center gap-2 mb-4">
        {(['all', 'planning', 'active', 'on_hold', 'completed', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filterStatus === s
                ? 'bg-rok-500 text-white'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
            }`}
          >
            {s === 'all' ? 'Semua' : STATUS_CONFIG[s]?.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Belum ada project"
          description="Buat project baru dari quotation yang sudah deal."
          action={<Button onClick={() => setShowCreate(true)}><Plus size={14} /> Buat Project</Button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['projects'] })
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Project Card ─────────────────────────────────────────────
function ProjectCard({ project: p, onClick }: { project: ProjectSummary; onClick: () => void }) {
  const budget = p.budget ?? p.total_quotation_nominal
  const expensePct = budget > 0 ? Math.round((p.total_expense / budget) * 100) : 0
  const isOverBudget = p.budget && p.total_expense > p.budget
  const statusCfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.active

  return (
    <div
      onClick={onClick}
      className="border border-border rounded-lg p-4 bg-white hover:bg-rok-50/30 hover:border-rok-200 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] text-muted-foreground">{p.code}</span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            {isOverBudget && (
              <span className="flex items-center gap-0.5 text-[10px] text-red-600 font-medium">
                <AlertTriangle size={10} /> Over budget
              </span>
            )}
          </div>
          <p className="font-semibold text-sm text-foreground truncate">{p.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{p.client_names || '—'}</p>
          {(p.start_date || p.end_date) && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {p.start_date ? formatDate(p.start_date) : '?'} → {p.end_date ? formatDate(p.end_date) : '?'}
            </p>
          )}
        </div>

        <div className="text-right shrink-0 min-w-[180px]">
          <div className="flex items-center justify-end gap-3 mb-2">
            <div>
              <p className="text-[10px] text-muted-foreground">Quotation</p>
              <p className="text-xs font-semibold">{formatRp(p.total_quotation_nominal, { short: true })}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Expense</p>
              <p className={`text-xs font-semibold ${isOverBudget ? 'text-red-600' : ''}`}>
                {formatRp(p.total_expense, { short: true })}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Profit est.</p>
              <p className="text-xs font-semibold text-green-700">
                {formatRp(p.total_income_forecast - p.total_expense, { short: true })}
              </p>
            </div>
          </div>
          <div className="w-full bg-secondary rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${isOverBudget ? 'bg-red-500' : expensePct > 80 ? 'bg-amber-500' : 'bg-rok-500'}`}
              style={{ width: `${Math.min(expensePct, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{expensePct}% dari budget</p>
        </div>
        <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1" />
      </div>
    </div>
  )
}

// ─── Create Project Modal ─────────────────────────────────────
function CreateProjectModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { selectedCompanyId } = useCompanyStore()

  const [form, setForm] = useState({
    name:        '',
    code:        generateProjectCode(),
    start_date:  '',
    end_date:    '',
    budget_pct:  '100',
    status:      'active' as const,
    description: '',
  })
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedQuotations, setSelectedQuotations] = useState<string[]>([])
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Fetch all available deal quotations
  const { data: allAvailableQTs = [] } = useQuery({
    queryKey: ['available-deal-quotations', selectedCompanyId],
    queryFn: () => getAvailableDealQuotations(selectedCompanyId),
  })

  // Derive unique clients from available QTs
  const clientOptions = Array.from(
    new Map(
      allAvailableQTs
        .map((q: any) => ({ id: q.clients?.id ?? q.client_id, name: q.clients?.name ?? '—' }))
        .filter(c => c.id)
        .map(c => [c.id, c])
    ).values()
  )

  // Filter QTs by selected client
  const filteredQTs = selectedClientId
    ? allAvailableQTs.filter((q: any) => (q.clients?.id ?? q.client_id) === selectedClientId)
    : allAvailableQTs

  // Reset selected quotations when client changes
  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId)
    setSelectedQuotations([])
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const firstQT = allAvailableQTs.find((q: any) => selectedQuotations.includes(q.id))
      const company_id = (firstQT as any)?.company_id ?? selectedCompanyId ?? undefined

      const totalNominal = allAvailableQTs
        .filter((q: any) => selectedQuotations.includes(q.id))
        .reduce((s: number, q: any) => s + (q.nominal ?? 0), 0)

      const budget_pct = parseFloat(form.budget_pct) || 100
      const budget = totalNominal * budget_pct / 100

      const project = await createProject({
        name:        form.name,
        code:        form.code,
        start_date:  form.start_date || undefined,
        end_date:    form.end_date || undefined,
        budget_pct,
        budget,
        company_id,
        description: form.description || undefined,
        status:      form.status,
      })

      for (const qtId of selectedQuotations) {
        await linkQuotationToProject(qtId, project.id)
      }

      return project
    },
    onSuccess,
  })

  const totalNominal = allAvailableQTs
    .filter((q: any) => selectedQuotations.includes(q.id))
    .reduce((s: number, q: any) => s + (q.nominal ?? 0), 0)

  const budget = totalNominal * (parseFloat(form.budget_pct) || 100) / 100

  const toggleQT = (id: string) => {
    setSelectedQuotations(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <Modal open onClose={onClose} title="Buat Project Baru" width="max-w-xl">
      <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">

        {/* Basic info */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nama Project *" value={form.name} onChange={e => set('name', e.target.value)} />
          <Input label="Kode Project" value={form.code} onChange={e => set('code', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start Date" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          <Input label="End Date (estimasi)" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
        </div>
        <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
        </Select>

        {/* Step 1: Pilih Client */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            1. Pilih Client *
          </p>
          <Select
            label=""
            value={selectedClientId}
            onChange={e => handleClientChange(e.target.value)}
          >
            <option value="">— Pilih client —</option>
            {(clientOptions as any[]).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>

        {/* Step 2: Pilih Quotation (filtered by client) */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            2. Pilih Quotation Deal *
            {selectedClientId && filteredQTs.length === 0 && (
              <span className="ml-2 text-amber-600">— Tidak ada quotation deal untuk client ini</span>
            )}
            {!selectedClientId && (
              <span className="ml-2 text-muted-foreground italic">— Pilih client dulu</span>
            )}
          </p>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto border border-border rounded-lg p-2">
            {!selectedClientId ? (
              <p className="text-xs text-muted-foreground text-center py-4">Pilih client terlebih dahulu.</p>
            ) : filteredQTs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Tidak ada quotation deal yang tersedia untuk client ini.
              </p>
            ) : (
              filteredQTs.map((qt: any) => (
                <label
                  key={qt.id}
                  className={`flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-colors ${
                    selectedQuotations.includes(qt.id)
                      ? 'bg-rok-50 border border-rok-200'
                      : 'hover:bg-secondary/50 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedQuotations.includes(qt.id)}
                    onChange={() => toggleQT(qt.id)}
                    className="rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{qt.qt_number}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {qt.services?.code} · {qt.title} · {formatRp(qt.nominal ?? 0, { short: true })}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Budget setting */}
        {selectedQuotations.length > 0 && (
          <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Budget Project</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground mb-1">% dari total QT</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="1" max="100" step="1"
                    className="w-full px-2 py-1.5 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-rok-400"
                    value={form.budget_pct}
                    onChange={e => set('budget_pct', e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex-1 text-right">
                <p className="text-[10px] text-muted-foreground">Total QT dipilih</p>
                <p className="text-xs font-medium">{formatRp(totalNominal)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Budget</p>
                <p className="text-sm font-bold text-rok-700">{formatRp(budget)}</p>
              </div>
            </div>
            <p className="text-[10px] text-amber-600">
              ⚠️ Alarm aktif jika total expense melebihi budget
            </p>
          </div>
        )}

        <Input label="Deskripsi (opsional)" value={form.description} onChange={e => set('description', e.target.value)} />

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            onClick={() => createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={!form.name || !selectedClientId || selectedQuotations.length === 0 || createMutation.isPending}
          >
            <FolderKanban size={13} /> Buat Project
          </Button>
        </div>
      </div>
    </Modal>
  )
}
