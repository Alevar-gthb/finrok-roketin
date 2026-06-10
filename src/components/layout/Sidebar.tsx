import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Receipt, CreditCard, TrendingUp,
  Settings, LogOut, Users, Building2, FolderKanban, ChevronDown, ChevronRight, Settings2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { signOut } from '@/lib/auth'
import { useQuery } from '@tanstack/react-query'
import { getCompanies } from '@/services/companyService'
import { useCompanyStore } from '@/store/useCompanyStore'
import { useEffect, useState } from 'react'

// Menu utama — terkena company filter
const mainNav = [
  { to: '/',           label: 'Dashboard',  icon: LayoutDashboard, end: true  },
  { to: '/quotations', label: 'Quotations', icon: FileText,        end: false },
  { to: '/invoices',   label: 'Invoices',   icon: Receipt,         end: false },
  { to: '/payments',   label: 'Payments',   icon: CreditCard,      end: false },
  { to: '/income',     label: 'Income',     icon: TrendingUp,      end: false },
  { to: '/projects',   label: 'Projects',   icon: FolderKanban,    end: false },
]

// Submenu Configuration — tidak terkena company filter
const configNav = [
  { to: '/master',    label: 'Master Data',       icon: Settings,  adminOnly: false },
  { to: '/users',     label: 'Users',             icon: Users,     adminOnly: true  },
  { to: '/companies', label: 'Company Settings',  icon: Building2, adminOnly: true  },
]

export default function Sidebar() {
  const { profile } = useAuth()
  const location = useLocation()
  const { selectedCompanyId, setSelectedCompanyId } = useCompanyStore()
  const [configOpen, setConfigOpen] = useState(false)

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
  })

  // Set default company otomatis
  useEffect(() => {
    if (!selectedCompanyId && companies.length > 0) {
      const def = companies.find(c => c.is_default)
      if (def) setSelectedCompanyId(def.id)
    }
  }, [companies])

  // Auto-buka Configuration kalau sedang di salah satu submenu-nya
  useEffect(() => {
    const isInConfig = configNav.some(item => location.pathname.startsWith(item.to))
    if (isInConfig) setConfigOpen(true)
  }, [location.pathname])

  const isInConfig = configNav.some(item => location.pathname.startsWith(item.to))

  const ROLE_BADGE: Record<string, string> = {
    admin:   'bg-rok-100 text-rok-700',
    finance: 'bg-blue-100 text-blue-700',
    viewer:  'bg-slate-100 text-slate-600',
  }

  const visibleConfigNav = configNav.filter(item => !item.adminOnly || profile?.role === 'admin')

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

      {/* Company Filter */}
      <div className="px-3 py-2 border-b border-border">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 px-1">Company</p>
        <div className="relative">
          <select
            value={selectedCompanyId ?? ''}
            onChange={e => setSelectedCompanyId(e.target.value || null)}
            className="w-full appearance-none bg-rok-50 border border-rok-200 text-rok-800 text-xs font-medium rounded-lg px-3 py-2 pr-7 focus:outline-none focus:ring-2 focus:ring-rok-400 cursor-pointer"
          >
            <option value="">Semua Company</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.is_default ? ' ★' : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rok-500 pointer-events-none" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {/* Main menu */}
        {mainNav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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

        {/* Divider */}
        <div className="pt-2 pb-1">
          <div className="border-t border-border" />
        </div>

        {/* Configuration group */}
        {visibleConfigNav.length > 0 && (
          <div>
            <button
              onClick={() => setConfigOpen(v => !v)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isInConfig
                  ? 'bg-rok-50 text-rok-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings2 size={15} />
                Configuration
              </div>
              {configOpen
                ? <ChevronDown size={12} className="text-muted-foreground" />
                : <ChevronRight size={12} className="text-muted-foreground" />
              }
            </button>

            {configOpen && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
                {visibleConfigNav.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-rok-50 text-rok-700 border border-rok-200'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                      }`
                    }
                  >
                    <Icon size={13} />
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
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
        <p className="text-[10px] text-muted-foreground px-3">v1.0.2</p>
      </div>
    </aside>
  )
}
