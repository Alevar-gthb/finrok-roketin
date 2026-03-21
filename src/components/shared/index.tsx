import { cn, formatRp, QT_STATUS_LABEL, INV_STATUS_LABEL, INV_DOC_STATUS_LABEL } from '@/lib/utils'
import type { QTStatus, InvTermStatus, InvDocStatus } from '@/types/database'
import { Loader2, SearchX, AlertTriangle } from 'lucide-react'

// ─── Status Badge ───────────────────────────────────────────
interface StatusBadgeProps { status: string; type?: 'qt' | 'term' | 'invoice' }
export function StatusBadge({ status, type = 'qt' }: StatusBadgeProps) {
  const label =
    type === 'qt'      ? QT_STATUS_LABEL[status]      :
    type === 'term'    ? INV_STATUS_LABEL[status]      :
    INV_DOC_STATUS_LABEL[status]

  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      `status-${status}`
    )}>
      {label ?? status}
    </span>
  )
}

// ─── Stat Card ───────────────────────────────────────────────
interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: 'default' | 'green' | 'amber' | 'red' | 'blue'
  icon?: React.ReactNode
}
export function StatCard({ label, value, sub, accent = 'default', icon }: StatCardProps) {
  const accentCls = {
    default: 'border-border',
    green:   'border-green-200 bg-green-50/40',
    amber:   'border-amber-200 bg-amber-50/40',
    red:     'border-red-200 bg-red-50/40',
    blue:    'border-rok-200 bg-rok-50/40',
  }[accent]

  return (
    <div className={cn('rounded-lg border p-4 bg-white', accentCls)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground num">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ─── Page Header ─────────────────────────────────────────────
interface PageHeaderProps {
  title: string
  sub?: string
  action?: React.ReactNode
}
export function PageHeader({ title, sub, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {sub && <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────
interface EmptyStateProps { title: string; description?: string; action?: React.ReactNode }
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <SearchX size={36} className="text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ─── Loading Spinner ─────────────────────────────────────────
export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-16', className)}>
      <Loader2 size={24} className="animate-spin text-muted-foreground" />
    </div>
  )
}

// ─── Error State ─────────────────────────────────────────────
export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertTriangle size={32} className="text-destructive/60 mb-3" />
      <p className="text-sm text-foreground">Gagal memuat data</p>
      <p className="text-xs text-muted-foreground mt-1">{message}</p>
    </div>
  )
}

// ─── Simple Table ─────────────────────────────────────────────
interface Column<T> {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
}
interface SimpleTableProps<T> {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (row: T) => void
}
export function SimpleTable<T extends { id: string }>({ data, columns, onRowClick }: SimpleTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            {columns.map(col => (
              <th key={col.key} className={cn('px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.id}
              className={cn(
                'border-b border-border last:border-0 transition-colors',
                i % 2 === 0 ? 'bg-white' : 'bg-secondary/20',
                onRowClick && 'cursor-pointer hover:bg-rok-50/50'
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map(col => (
                <td key={col.key} className={cn('px-4 py-2.5', col.className)}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Amount display ───────────────────────────────────────────
export function Amount({ value, className }: { value: number; className?: string }) {
  return <span className={cn('num text-right tabular-nums', className)}>{formatRp(value)}</span>
}

// ─── Divider ──────────────────────────────────────────────────
export function Divider({ className }: { className?: string }) {
  return <div className={cn('border-t border-border', className)} />
}

// ─── Button ───────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}
export function Button({ variant = 'default', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  const varCls = {
    default:     'bg-rok-500 text-white hover:bg-rok-600 border border-rok-500',
    outline:     'bg-white text-foreground border border-border hover:bg-secondary',
    ghost:       'bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent',
    destructive: 'bg-destructive text-white hover:bg-destructive/90 border border-destructive',
  }[variant]
  const sizeCls = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' }[size]

  return (
    <button
      className={cn('inline-flex items-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none', varCls, sizeCls, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

// ─── Input ────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string }
export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-medium text-foreground">{label}</label>}
      <input
        className={cn('w-full px-3 py-2 text-sm border rounded-md bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-rok-400 focus:border-rok-400 transition-colors', error ? 'border-destructive' : 'border-border', className)}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ─── Select ───────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; error?: string }
export function Select({ label, error, className, children, ...props }: SelectProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-medium text-foreground">{label}</label>}
      <select
        className={cn('w-full px-3 py-2 text-sm border rounded-md bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-rok-400 focus:border-rok-400 transition-colors', error ? 'border-destructive' : 'border-border', className)}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ─── Textarea ─────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; error?: string }
export function Textarea({ label, error, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-medium text-foreground">{label}</label>}
      <textarea
        className={cn('w-full px-3 py-2 text-sm border rounded-md bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-rok-400 focus:border-rok-400 transition-colors resize-none', error ? 'border-destructive' : 'border-border', className)}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ─── Modal / Dialog ───────────────────────────────────────────
interface ModalProps { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: string }
export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative bg-white rounded-xl shadow-xl border border-border w-full mx-4 animate-fade-in', width)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
