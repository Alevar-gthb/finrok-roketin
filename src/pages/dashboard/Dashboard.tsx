import { useEffect, useRef } from 'react'
import { useDashboard, useRefreshOverdue, useAllInvoiceTerms, useInvoices } from '@/hooks/useFinrok'
import { StatCard, PageHeader, LoadingSpinner, StatusBadge, Amount } from '@/components/shared'
import { formatRp, formatDate } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendingUp, FileText, Clock, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCompanyStore } from '@/store/useCompanyStore'

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

export default function Dashboard() {
  const { selectedCompanyId } = useCompanyStore()
  const lastRefreshedCompany = useRef<string | null>(null)
  const { data, isLoading } = useDashboard(selectedCompanyId)
  const { mutate: refreshOverdue } = useRefreshOverdue()
  const { data: needCreated } = useAllInvoiceTerms({ status: 'need_created', companyId: selectedCompanyId })
  const { data: issuedInvoices } = useInvoices({ status: 'issued', companyId: selectedCompanyId })
  const { data: overdueInvoices } = useInvoices({ status: 'overdue', companyId: selectedCompanyId })
  const navigate = useNavigate()

  useEffect(() => {
    const key = selectedCompanyId ?? '__all__'
    if (lastRefreshedCompany.current === key) return
    lastRefreshedCompany.current = key
    refreshOverdue()
  }, [selectedCompanyId, refreshOverdue])

  if (isLoading) return <LoadingSpinner />

  const waitingCount = issuedInvoices?.length ?? 0
  const waitingTotal = (issuedInvoices ?? []).reduce((sum, inv) => sum + inv.grand_total, 0)
  const overdueCount = overdueInvoices?.length ?? 0
  const overdueTotal = (overdueInvoices ?? []).reduce((sum, inv) => sum + inv.grand_total, 0)

  // Build chart data: merge monthly income + forecast for all 12 months
  const chartData = MONTHS.map((name, i) => {
    const month = i + 1
    const income   = data?.monthly_income?.find(m => m.month === month)
    const forecast = data?.monthly_forecast?.find(m => m.month === month)
    return {
      name,
      Paid:     income?.total_paid     ?? 0,
      Forecast: forecast?.forecast_amount ?? 0,
    }
  })

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        sub={`Update terakhir: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard
          label="QT Deal Aktif"
          value={data?.qt_deal_total ?? 0}
          sub="Total quotation berstatus Deal"
          accent="blue"
          icon={<FileText size={16} />}
        />
        <StatCard
          label="Invoice Waiting"
          value={formatRp(waitingTotal, { short: true })}
          sub={`${waitingCount} invoice berstatus issued`}
          accent={data?.inv_waiting_count ? 'amber' : 'default'}
          icon={<Clock size={16} />}
        />
        <StatCard
          label="Invoice Overdue"
          value={formatRp(overdueTotal, { short: true })}
          sub={`${overdueCount} invoice due date terlewati, belum dibayar`}
          accent={overdueCount ? 'red' : 'default'}
          icon={<AlertCircle size={16} />}
        />
        <StatCard
          label="Paid Bulan Ini"
          value={formatRp(data?.paid_this_month, { short: true })}
          sub="Total pembayaran masuk bulan ini"
          accent="green"
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Forecast Bulan Ini"
          value={formatRp(data?.forecast_this_month, { short: true })}
          sub="Estimasi pembayaran masuk bulan ini"
          accent="default"
          icon={<TrendingUp size={16} />}
        />
      </div>

      {/* Alert cards */}
      {(overdueCount > 0 || (data?.need_created_count ?? 0) > 0) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {overdueCount > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">{overdueCount} Invoice Overdue</p>
                <p className="text-xs text-red-600 mt-0.5">Due date telah terlewati dan belum dibayar</p>
                <button onClick={() => navigate('/invoices?status=overdue')} className="text-xs text-red-700 font-medium underline mt-1">
                  Lihat semua →
                </button>
              </div>
            </div>
          )}
          {(data?.need_created_count ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <Clock size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700">{data?.need_created_count} Invoice Perlu Dibuat</p>
                <p className="text-xs text-amber-600 mt-0.5">Estimasi tanggal sudah dekat atau lewat</p>
                <button onClick={() => navigate('/invoices?tab=terms&status=need_created')} className="text-xs text-amber-700 font-medium underline mt-1">
                  Buat invoice →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts + tables row */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {/* Bar chart */}
        <div className="col-span-3 rounded-lg border border-border bg-white p-4">
          <p className="text-sm font-medium text-foreground mb-4">Income vs Forecast {new Date().getFullYear()}</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={18} barGap={4}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${(v/1_000_000).toFixed(0)}jt`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v: number) => formatRp(v)} />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Paid"     fill="#22c55e" radius={[3,3,0,0]} />
              <Bar dataKey="Forecast" fill="#93c5fd" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Need created list */}
        <div className="col-span-2 rounded-lg border border-border bg-white p-4">
          <p className="text-sm font-medium text-foreground mb-3">Invoice Perlu Dibuat</p>
          {!needCreated?.length ? (
            <p className="text-xs text-muted-foreground italic py-4 text-center">Semua sudah digenerate ✓</p>
          ) : (
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {needCreated.slice(0, 8).map(term => (
                <div key={term.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{term.quotation?.qt_number}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{term.label}</p>
                    <p className="text-[11px] text-amber-600">Est: {formatDate(term.est_date)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Amount value={term.nominal} className="text-xs" />
                    <button
                      className="block text-[11px] text-rok-600 font-medium mt-0.5 hover:underline"
                      onClick={() => navigate(`/invoices/generate/${term.id}`)}
                    >
                      Generate →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overdue invoices table */}
      {(overdueInvoices?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-border bg-white">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Invoice Overdue</p>
            <StatusBadge status="overdue" type="invoice" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  {['Invoice #','QT #','Client','Grand Total','Due Date','Action'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overdueInvoices?.map((inv, i) => {
                  const qt  = inv.invoice_term?.quotation
                  const cli = qt?.client
                  return (
                    <tr key={inv.id} className={`border-b border-border last:border-0 ${i%2===0?'bg-white':'bg-secondary/20'}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-rok-700 font-medium">{inv.inv_number}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{qt?.qt_number}</td>
                      <td className="px-4 py-2.5 text-xs">{cli?.name}</td>
                      <td className="px-4 py-2.5 text-xs text-right num">{formatRp(inv.grand_total)}</td>
                      <td className="px-4 py-2.5 text-xs text-red-600 font-medium">{formatDate(inv.due_date)}</td>
                      <td className="px-4 py-2.5">
                        <button
                          className="text-xs text-rok-600 font-medium hover:underline"
                          onClick={() => navigate(`/payments?invoice=${inv.id}`)}
                        >
                          Mark Paid →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
