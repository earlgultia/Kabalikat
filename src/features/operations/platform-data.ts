import { supabase } from '../../lib/supabase'

export type PlatformBarangayRow = {
  id: string; name: string; municipality: string; province: string; code: string; status: 'active' | 'suspended' | 'archived'
  created_at: string; active_members: number
}

export type PlatformDirectorySummary = { registered_count: number; active_count: number; needs_attention_count: number }
export const PLATFORM_DIRECTORY_PAGE_SIZE = 25

export async function listPlatformBarangayPage(input: { page: number; search: string; status: string }) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('list_platform_barangay_directory_page', {
    p_page: Math.max(input.page, 0), p_page_size: PLATFORM_DIRECTORY_PAGE_SIZE,
    p_search: input.search.trim() || null, p_status: input.status,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as (PlatformBarangayRow & { total_count: number })[]
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function getPlatformDirectorySummary() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('get_platform_barangay_directory_summary')
  if (error) throw new Error(error.message)
  return (data?.[0] ?? { registered_count: 0, active_count: 0, needs_attention_count: 0 }) as PlatformDirectorySummary
}

export async function listPlatformBarangays() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('get_platform_barangay_directory')
  if (error) throw new Error(error.message)
  return (data ?? []) as PlatformBarangayRow[]
}
