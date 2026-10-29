import { supabase } from '../../lib/supabase'

export type PlatformBarangayRow = {
  id: string; name: string; municipality: string; province: string; code: string; status: 'active' | 'suspended' | 'archived'
  created_at: string; active_members: number
}

export async function listPlatformBarangays() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('get_platform_barangay_directory')
  if (error) throw new Error(error.message)
  return (data ?? []) as PlatformBarangayRow[]
}
