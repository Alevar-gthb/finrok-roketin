import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Sidebar      from '@/components/layout/Sidebar'
import Dashboard    from '@/pages/dashboard/Dashboard'
import Quotations   from '@/pages/quotations/Quotations'
import Invoices     from '@/pages/invoices/Invoices'
import Payments     from '@/pages/payments/Payments'
import Income       from '@/pages/income/Income'
import MasterData   from '@/pages/master/MasterData'
import LoginPage    from '@/pages/auth/LoginPage'
import UsersPage    from '@/pages/users/UsersPage'

function AppShell() {
  const { session, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground animate-pulse">Memuat...</div>
    </div>
  )

  if (!session) return <LoginPage />

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 ml-56 overflow-y-auto">
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/quotations/*" element={<Quotations />} />
          <Route path="/invoices/*"   element={<Invoices />} />
          <Route path="/payments"     element={<Payments />} />
          <Route path="/income"       element={<Income />} />
          <Route path="/master/*"     element={<MasterData />} />
          <Route path="/users"          element={<UsersPage />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  )
}
