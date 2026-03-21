import { useState } from 'react'
import { signIn } from '@/lib/auth'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err: any) {
      setError(err.message ?? 'Login gagal. Periksa email dan password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rok-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rok-600 mb-4">
            <span className="text-white text-2xl font-bold">F</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Finrok</h1>
          <p className="text-sm text-slate-500 mt-1">Finance Roketin — Internal Tool</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-border p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Masuk ke Akun</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-rok-400"
                placeholder="nama@roketin.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
              <input
                type="password"
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-rok-400"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-rok-600 hover:bg-rok-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Masuk...' : 'Masuk'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">
          Hubungi admin untuk membuat akun baru.
        </p>
      </div>
    </div>
  )
}
