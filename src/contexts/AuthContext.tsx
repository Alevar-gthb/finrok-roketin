import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { getProfile, type UserProfile } from '@/lib/auth'
import type { Session } from '@supabase/supabase-js'

interface AuthContextType {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  isAdmin: boolean
  isFinance: boolean
}

const AuthContext = createContext<AuthContextType>({
  session: null, profile: null, loading: true, isAdmin: false, isFinance: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (userId: string) => {
    try {
      const p = await getProfile(userId)
      if (p) {
        setProfile(p)
      } else {
        // Retry sekali setelah 1 detik (trigger mungkin belum selesai)
        await new Promise(r => setTimeout(r, 1000))
        const p2 = await getProfile(userId)
        setProfile(p2)
      }
    } catch {
      setProfile(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{
      session, profile, loading,
      isAdmin:   profile?.role === 'admin',
      isFinance: profile?.role === 'admin' || profile?.role === 'finance',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
