import { supabase } from './supabase'

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'finance' | 'viewer'
  is_active: boolean
  created_at: string
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data as UserProfile | null
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as UserProfile[]
}

export async function updateUserRole(userId: string, role: string) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ role })
    .eq('id', userId)
  if (error) throw error
}
