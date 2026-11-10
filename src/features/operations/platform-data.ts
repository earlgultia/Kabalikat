import { supabase } from '../../lib/supabase'

export type PlatformBarangayRow = {
  id: string; name: string; municipality: string; province: string; code: string; status: 'active' | 'suspended' | 'archived'
  created_at: string; active_members: number
}

export type PlatformDirectorySummary = { registered_count: number; active_count: number; needs_attention_count: number }
export const PLATFORM_DIRECTORY_PAGE_SIZE = 25

export type PlatformCaptainAccount = {
  user_id: string; display_name: string; email: string; barangays: string
  membership_count: number; active_membership_count: number
  removal_started_at: string | null; removal_completed_at: string | null
  removal_reason: string | null
}
export const PLATFORM_CAPTAIN_PAGE_SIZE = 10

export async function listPlatformCaptainAccounts(page: number, search: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('list_platform_captain_accounts', {
    p_page: Math.max(page, 0), p_page_size: PLATFORM_CAPTAIN_PAGE_SIZE, p_search: search.trim() || null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as (PlatformCaptainAccount & { total_count: number })[]
  const pendingIds = rows
    .filter((row) => row.removal_started_at && !row.removal_completed_at)
    .map((row) => row.user_id)
  if (pendingIds.length) {
    const { data: removals, error: removalError } = await supabase
      .from('platform_account_removal_events')
      .select('target_user_id, reason')
      .in('target_user_id', pendingIds)
      .is('completed_at', null)
    if (removalError) throw new Error(removalError.message)
    const reasonByUserId = new Map((removals ?? []).map((removal) => [removal.target_user_id, removal.reason]))
    for (const row of rows) row.removal_reason = reasonByUserId.get(row.user_id) ?? null
  }
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function removePlatformCaptainAccount(userId: string, reason: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('remove-platform-captain-account', {
    body: { user_id: userId, reason },
  })
  if (error) {
    const context = error.context
    if (context instanceof Response) {
      const detail = await context.clone().json().catch(() => null) as { error?: string } | null
      if (detail?.error) throw new Error(detail.error)
    }
    throw new Error(error.message)
  }
  if (data?.success !== true) throw new Error('Captain account removal was not confirmed by the server.')
  return { alreadyRemoved: data.alreadyRemoved === true }
}

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

export async function createExistingBarangayCaptainInvitation(barangayCode: string, captainEmail: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('create_platform_captain_invitation', {
    p_barangay_code: barangayCode.trim(),
    p_captain_email: captainEmail.trim(),
  })
  if (error) throw new Error(error.message)
  const result = (data ?? [])[0] as { invitation_token: string; expires_at: string } | undefined
  if (!result?.invitation_token) throw new Error('The Captain invitation could not be created.')
  return result
}
