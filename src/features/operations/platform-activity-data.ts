import { supabase } from '../../lib/supabase'

export type PlatformActivityEvent = {
  id: string
  barangay_id: string | null
  barangay_name: string | null
  actor_name: string
  event_type: 'barangay_onboarded' | 'subscription_created' | 'subscription_updated' | 'subscription_plan_updated'
  summary: string
  created_at: string
}

export const PLATFORM_ACTIVITY_PAGE_SIZE = 25
export const PLATFORM_ACTIVITY_EXPORT_PAGE_SIZE = 100

export async function listPlatformActivityPage(input: { page: number; eventType: string; search: string; createdAfter?: string | null; createdBefore?: string | null }) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('list_platform_activity_page', {
    p_page: Math.max(input.page, 0), p_page_size: PLATFORM_ACTIVITY_PAGE_SIZE,
    p_event_type: input.eventType, p_search: input.search.trim().slice(0, 100) || null,
    p_created_after: input.createdAfter ?? null, p_created_before: input.createdBefore ?? null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<PlatformActivityEvent & { total_count: number }>
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listPlatformActivityExportPage(input: {
  eventType: string
  search: string
  createdAfter?: string | null
  createdBefore?: string | null
  cursorCreatedAt?: string | null
  cursorId?: string | null
  snapshotCreatedAt?: string | null
  snapshotId?: string | null
  signal?: AbortSignal
}) {
  if (!supabase) throw new Error('Supabase is not configured.')
  let request = supabase.rpc('list_platform_activity_export_page', {
    p_page_size: PLATFORM_ACTIVITY_EXPORT_PAGE_SIZE,
    p_event_type: input.eventType,
    p_search: input.search.trim().slice(0, 100) || null,
    p_created_after: input.createdAfter ?? null,
    p_created_before: input.createdBefore ?? null,
    p_cursor_created_at: input.cursorCreatedAt ?? null,
    p_cursor_id: input.cursorId ?? null,
    p_snapshot_created_at: input.snapshotCreatedAt ?? null,
    p_snapshot_id: input.snapshotId ?? null,
  })
  if (input.signal) request = request.abortSignal(input.signal)
  const { data, error } = await request
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<PlatformActivityEvent & {
    total_count: number
    snapshot_created_at: string
    snapshot_id: string
  }>
  return {
    rows,
    totalCount: Number(rows[0]?.total_count ?? 0),
    snapshotCreatedAt: rows[0]?.snapshot_created_at ?? input.snapshotCreatedAt ?? null,
    snapshotId: rows[0]?.snapshot_id ?? input.snapshotId ?? null,
  }
}
