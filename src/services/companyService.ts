import { supabase } from '@/lib/supabase'

export interface Company {
  id: string
  name: string
  address: string | null
  phone: string | null
  website: string | null
  email: string | null
  npwp: string | null
  logo_url: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// Fetch all active companies
export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('name')
  if (error) throw error
  return data
}

// Fetch default company
export async function getDefaultCompany(): Promise<Company | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('is_default', true)
    .single()
  if (error) return null
  return data
}

// Create company
export async function createCompany(
  payload: Omit<Company, 'id' | 'created_at' | 'updated_at'>
): Promise<Company> {
  const { data, error } = await supabase
    .from('companies')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// Update company
export async function updateCompany(
  id: string,
  payload: Partial<Omit<Company, 'id' | 'created_at' | 'updated_at'>>
): Promise<Company> {
  const { data, error } = await supabase
    .from('companies')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Set default company (unset others first)
export async function setDefaultCompany(id: string): Promise<void> {
  await supabase.from('companies').update({ is_default: false }).neq('id', id)
  const { error } = await supabase
    .from('companies')
    .update({ is_default: true })
    .eq('id', id)
  if (error) throw error
}

// Upload logo — returns public URL
export async function uploadCompanyLogo(
  companyId: string,
  file: File
): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${companyId}/logo.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('company-logos')
    .upload(path, file, { upsert: true })
  if (uploadError) throw uploadError

  const { data } = supabase.storage
    .from('company-logos')
    .getPublicUrl(path)
  return data.publicUrl
}

// Delete logo from storage
export async function deleteCompanyLogo(companyId: string): Promise<void> {
  const extensions = ['png', 'jpg', 'jpeg', 'svg', 'webp']
  for (const ext of extensions) {
    await supabase.storage
      .from('company-logos')
      .remove([`${companyId}/logo.${ext}`])
  }
}
