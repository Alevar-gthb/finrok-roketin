import { useDashboard } from '@/hooks/useFinrok'
import { PageHeader, LoadingSpinner } from '@/components/shared'
import { formatRp } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { useCompanyStore } from '@/store/useCompanyStore'

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

export default function Income() {
  const { selectedCompanyId } = useCompanyStore()
  const { data, isLoading } = useDashboard(selectedCompanyId)
  if (isLoading) return <LoadingSpinner />

  const chartData = MONTHS_SHORT.map((name, i) => {
    const month = i + 1
    const income   = data?.monthly_income?.find(m => m.month === month)
    const forecast = data?.monthly_forecast?.find(m => m.month === month)
    return { name, Paid: income?.total_paid ?? 0, Forecast: forecast?.forecast_amount ?? 0 }
  })

  const totalPaid     = data?.monthly_income?.reduce((s, m) => s + m.total_paid, 0) ?? 0
  const totalForecast = data?.monthly_forecast?.reduce((s, m) => s + m.forecast_amount, 0) ?? 0
  const year = new Date().getFullYear()

  return (
    <div className="page">
      <PageHeader title="Income & Forecast" sub={`Rekap keuangan tahun ${year}`} />
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border border-green-200 bg-green-50/40 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Paid {year}</p>
          <p className="text-2xl font-semibold num mt-1">{formatRp(totalPaid, { short: true })}</p>
          <p className="text-xs text-muted-foreground mt-1">{data?.monthly_income?.reduce((s,m) => s + m.invoice_count, 0) ?? 0} invoice dibayar</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Forecast {year}</p>
          <p className="text-2xl font-semibold num mt-1">{formatRp(totalForecast, { short: true })}</p>
          <p className="text-xs text-muted-foreground mt-1">{data?.monthly_forecast?.reduce((s,m) => s + m.term_count, 0) ?? 0} termin pending</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-white p-5 mb-5">
        <p className="text-sm font-medium text-foreground mb-5">Income vs Forecast per Bulan — {year}</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barSize={22} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `${(v/1_000_000).toFixed(0)}jt`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
            <Tooltip formatter={(v: number) => formatRp(v)} />
            <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Paid"     fill="#22c55e" radius={[3,3,0,0]} />
            <Bar dataKey="Forecast" fill="#93c5fd" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Monthly breakdown table */}
      <div className="rounded-lg border border-border overflow-hidden bg-white">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium">Breakdown per Bulan</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/40 border-b border-border">
              {['Bulan','Invoice Paid','Total Paid','Termin Forecast','Total Forecast','Selisih'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((name, i) => {
              const month    = i + 1
              const income   = data?.monthly_income?.find(m => m.month === month)
              const forecast = data?.monthly_forecast?.find(m => m.month === month)
              const diff     = (income?.total_paid ?? 0) - (forecast?.forecast_amount ?? 0)
              const isCurrentMonth = month === new Date().getMonth() + 1
              return (
                <tr key={month} className={`border-b border-border last:border-0 ${isCurrentMonth ? 'bg-rok-50/40' : i%2===0?'bg-white':'bg-secondary/10'}`}>
                  <td className="px-4 py-2.5 text-xs font-medium">{name} {isCurrentMonth && <span className="ml-1 text-[10px] bg-rok-100 text-rok-700 px-1.5 py-0.5 rounded">saat ini</span>}</td>
                  <td className="px-4 py-2.5 text-xs text-center">{income?.invoice_count ?? '-'}</td>
                  <td className="px-4 py-2.5 text-xs text-right num">{income ? formatRp(income.total_paid) : <span className="text-muted-foreground">-</span>}</td>
                  <td className="px-4 py-2.5 text-xs text-center">{forecast?.term_count ?? '-'}</td>
                  <td className="px-4 py-2.5 text-xs text-right num">{forecast ? formatRp(forecast.forecast_amount) : <span className="text-muted-foreground">-</span>}</td>
                  <td className={`px-4 py-2.5 text-xs text-right num font-medium ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {income || forecast ? (diff >= 0 ? '+' : '') + formatRp(diff) : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-secondary/30">
              <td className="px-4 py-2.5 text-xs font-semibold">TOTAL</td>
              <td className="px-4 py-2.5 text-xs text-center font-semibold">{data?.monthly_income?.reduce((s,m)=>s+m.invoice_count,0) ?? 0}</td>
              <td className="px-4 py-2.5 text-xs text-right num font-semibold text-green-700">{formatRp(totalPaid)}</td>
              <td className="px-4 py-2.5 text-xs text-center font-semibold">{data?.monthly_forecast?.reduce((s,m)=>s+m.term_count,0) ?? 0}</td>
              <td className="px-4 py-2.5 text-xs text-right num font-semibold">{formatRp(totalForecast)}</td>
              <td className="px-4 py-2.5 text-xs text-right num font-semibold">{formatRp(totalPaid - totalForecast)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
