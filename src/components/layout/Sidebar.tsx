import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FileText, Receipt, CreditCard, TrendingUp, Settings, LogOut, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { signOut } from '@/lib/auth'

const nav = [
  { to: '/',            label: 'Dashboard',   icon: LayoutDashboard, adminOnly: false },
  { to: '/quotations',  label: 'Quotations',  icon: FileText,        adminOnly: false },
  { to: '/invoices',    label: 'Invoices',    icon: Receipt,         adminOnly: false },
  { to: '/payments',    label: 'Payments',    icon: CreditCard,      adminOnly: false },
  { to: '/income',      label: 'Income',      icon: TrendingUp,      adminOnly: false },
  { to: '/master',      label: 'Master Data', icon: Settings,        adminOnly: false },
  { to: '/users',       label: 'Users',       icon: Users,           adminOnly: true  },
]

export default function Sidebar() {
  const { profile } = useAuth()

  const ROLE_BADGE: Record<string, string> = {
    admin: 'bg-rok-100 text-rok-700',
    finance: 'bg-blue-100 text-blue-700',
    viewer: 'bg-slate-100 text-slate-600',
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-white border-r border-border flex flex-col z-30">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rok-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">F</span>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 leading-none">Finrok</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Finance Roketin</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {nav.filter(item => !item.adminOnly || profile?.role === 'admin').map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-rok-50 text-rok-700 border border-rok-200'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        {profile && (
          <div className="px-3 py-2 rounded-lg bg-secondary/50">
            <p className="text-xs font-medium text-slate-700 truncate">{profile.full_name ?? profile.email}</p>
            <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${ROLE_BADGE[profile.role] ?? ''}`}>
              {profile.role}
            </span>
          </div>
        )}
        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={13} /> Keluar
        </button>
        <p className="text-[10px] text-muted-foreground px-3">PT Roketin Kreatif Teknologi</p>
        <p className="text-[10px] text-muted-foreground px-3">v1.0.0</p>
      </div>
    </aside>
  )
}
