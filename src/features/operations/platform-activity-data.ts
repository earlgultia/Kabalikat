import { supabase } from '../../lib/supabase'

export type PlatformActivityEvent = {
  id: string
  barangay_id: string | null
  barangay_name: string | null
  actor_name: string
  event_type: 'barangay_onboarded' | 'subscription_created' | 'subscription_updated'
  summary: string
  created_at: string
}

export const PLATFORM_ACTIVITY_PAGE_SIZE = 25

export async function listPlatformActivityPage(input: { page: number; eventType: string; search: string }) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('list_platform_activity_page', {
    p_page: Math.max(input.page, 0), p_page_size: PLATFORM_ACTIVITY_PAGE_SIZE,
    p_event_type: input.eventType, p_search: input.search.trim().slice(0, 100) || null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<PlatformActivityEvent & { total_count: number }>
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}
