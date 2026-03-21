import { useState, useEffect } from 'react'
import { getAllUsers, updateUserRole, type UserProfile } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader, Button, Select, Modal, Input, LoadingSpinner } from '@/components/shared'
import { UserPlus, Shield, Ban, RefreshCw } from 'lucide-react'

export default function UsersPage() {
  const { isAdmin } = useAuth()
  const [users, setUsers]     = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError]     = useState('')

  const loadUsers = async () => {
    setLoading(true)
    const data = await getAllUsers()
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  const handleRoleChange = async (userId: string, role: string) => {
    setActionLoading(userId); setError('')
    try { await updateUserRole(userId, role); await loadUsers() }
    catch (e: any) { setError(e.message) }
    finally { setActionLoading(null) }
  }

  const handleToggleSuspend = async (user: UserProfile) => {
    setActionLoading(user.id); setError('')
    try {
      const { error } = await supabase.from('user_profiles').update({ is_active: !user.is_active }).eq('id', user.id)
      if (error) throw error
      await loadUsers()
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null) }
  }

  if (!isAdmin) return (
    <div className="page flex items-center justify-center">
      <div className="text-center space-y-2">
        <Shield size={40} className="text-muted-foreground mx-auto" />
        <p className="text-sm font-medium">Akses Terbatas</p>
        <p className="text-xs text-muted-foreground">Hanya admin yang bisa mengakses halaman ini.</p>
      </div>
    </div>
  )

  return (
    <div className="page">
      <PageHeader title="User Management" sub="Kelola akses dan role pengguna Finrok"
        action={<Button onClick={() => setShowInvite(true)}><UserPlus size={14} /> Undang User</Button>}
      />
      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">{error}</div>}
      {loading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                {['Nama / Email','Role','Status','Bergabung','Aksi'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr key={user.id} className={`border-b border-border last:border-0 ${i%2===0?'bg-white':'bg-secondary/10'}`}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium">{user.full_name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Select value={user.role} onChange={e => handleRoleChange(user.id, e.target.value)}
                      disabled={actionLoading === user.id}>
                      <option value="admin">Admin</option>
                      <option value="finance">Finance</option>
                      <option value="viewer">Viewer</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${user.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                      {user.is_active ? 'Aktif' : 'Suspended'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date((user as any).created_at).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleSuspend(user)} disabled={actionLoading === user.id}
                      className={`text-[11px] font-medium flex items-center gap-1 hover:underline ${user.is_active ? 'text-amber-600' : 'text-green-600'}`}>
                      {actionLoading === user.id
                        ? <RefreshCw size={11} className="animate-spin" />
                        : <Ban size={11} />}
                      {user.is_active ? 'Suspend' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} onSuccess={() => { setShowInvite(false); loadUsers() }} />}
    </div>
  )
}

function InviteUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'viewer' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.email || !form.password) return
    setLoading(true); setError('')
    try {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name, role: form.role } },
      })
      if (signUpErr) throw signUpErr
      await new Promise(r => setTimeout(r, 1000))
      const { data: profile } = await supabase.from('user_profiles').select('id').eq('email', form.email).single()
      if (profile) await updateUserRole(profile.id, form.role)
      onSuccess()
    } catch (e: any) {
      setError(e.message ?? 'Gagal membuat user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open title="Undang User Baru" onClose={onClose} width="max-w-md">
      <div className="space-y-4">
        <Input label="Nama Lengkap" placeholder="Nama pengguna" value={form.full_name} onChange={e => set('full_name', e.target.value)} />
        <Input label="Email *" type="email" placeholder="email@roketin.com" value={form.email} onChange={e => set('email', e.target.value)} />
        <Input label="Password *" type="password" placeholder="Min. 6 karakter" value={form.password} onChange={e => set('password', e.target.value)} />
        <Select label="Role" value={form.role} onChange={e => set('role', e.target.value)}>
          <option value="admin">Admin — Akses penuh</option>
          <option value="finance">Finance — Kelola invoice dan payment</option>
          <option value="viewer">Viewer — Lihat data saja</option>
        </Select>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="bg-secondary/40 rounded-lg p-3 text-xs text-muted-foreground">
          User akan langsung bisa login dengan email dan password yang dibuat di sini.
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!form.email || !form.password}>
            <UserPlus size={13} /> Buat User
          </Button>
        </div>
      </div>
    </Modal>
  )
}
