import { supabase } from '../../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export type LguMonthlySubscription = {
  plan_key: string; plan_name: string; status: string
  period_started_at: string; period_ends_at: string; updated_at: string
}
export type LguSubscriptionRequest = {
  request_id: string; lgu_id: string; municipality: string; province: string
  plan_key: string; plan_name: string; requester_name: string; request_note: string
  status: 'pending' | 'activated' | 'declined'; admin_note: string
  created_at: string; reviewed_at: string | null; total_count: number
}
export const LGU_SUBSCRIPTION_REQUEST_PAGE_SIZE = 20
export const PLATFORM_LGU_SUBSCRIPTION_PAGE_SIZE = 25

export type PlatformLguSubscriptionRow = {
  lgu_id: string; municipality: string; province: string; lgu_status: string
  plan_key: string | null; plan_name: string | null
  subscription_status: 'active' | 'past_due' | 'suspended' | 'cancelled' | null
  period_started_at: string | null; period_ends_at: string | null
  admin_note: string | null; updated_at: string | null; total_count: number
}
export type PlatformLguSubscriptionSummary = {
  municipality_count: number; active_count: number; ending_soon_count: number
  past_due_count: number; suspended_count: number; no_subscription_count: number
}
export type PlatformLguWorkspaceStatusEvent = {
  id: string; actor_name: string; from_status: string; to_status: string; reason: string; created_at: string
}

export async function getLguMonthlySubscription() {
  const { data, error } = await client().rpc('get_lgu_monthly_subscription')
  if (error) throw new Error(error.message)
  return ((data ?? [])[0] ?? null) as LguMonthlySubscription | null
}

export async function listLguMonthlySubscriptionRequests() {
  const { data, error } = await client().rpc('list_lgu_monthly_subscription_requests')
  if (error) throw new Error(error.message)
  return (data ?? []) as (Pick<LguSubscriptionRequest, 'request_id' | 'plan_key' | 'plan_name' | 'status' | 'request_note' | 'admin_note' | 'created_at' | 'reviewed_at'>)[]
}

export async function requestLguMonthlySubscription(note: string) {
  const { data, error } = await client().rpc('request_lgu_monthly_subscription', { p_note: note.trim() })
  if (error) throw new Error(error.message)
  return data as string
}

export async function listPlatformLguSubscriptionRequests(page: number, status: string) {
  const { data, error } = await client().rpc('list_platform_lgu_subscription_requests', {
    p_page: Math.max(0, page), p_page_size: LGU_SUBSCRIPTION_REQUEST_PAGE_SIZE, p_status: status,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as LguSubscriptionRequest[]
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function listPlatformLguSubscriptions(page: number, search: string, status: string) {
  const { data, error } = await client().rpc('list_platform_lgu_subscription_status', {
    p_page: Math.max(0, page), p_page_size: PLATFORM_LGU_SUBSCRIPTION_PAGE_SIZE,
    p_search: search.trim() || null, p_status: status,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as PlatformLguSubscriptionRow[]
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function getPlatformLguSubscriptionSummary() {
  const { data, error } = await client().rpc('get_platform_lgu_subscription_summary')
  if (error) throw new Error(error.message)
  return ((data ?? [])[0] ?? null) as PlatformLguSubscriptionSummary | null
}

export async function setPlatformLguWorkspaceStatus(lguId: string, status: 'active' | 'suspended', reason: string) {
  const { error } = await client().rpc('set_platform_lgu_workspace_status', {
    p_lgu_id: lguId, p_status: status, p_reason: reason.trim(),
  })
  if (error) throw new Error(error.message)
}

export async function listPlatformLguWorkspaceStatusHistory(lguId: string) {
  const { data, error } = await client().rpc('list_platform_lgu_workspace_status_history', { p_lgu_id: lguId })
  if (error) throw new Error(error.message)
  return (data ?? []) as PlatformLguWorkspaceStatusEvent[]
}

export async function activateLguMonthlySubscriptionRequest(requestId: string, paymentNote: string) {
  const { error } = await client().rpc('activate_lgu_monthly_subscription_request', { p_request_id: requestId, p_payment_confirmation_note: paymentNote.trim() })
  if (error) throw new Error(error.message)
}

export async function declineLguMonthlySubscriptionRequest(requestId: string, reason: string) {
  const { error } = await client().rpc('decline_lgu_monthly_subscription_request', { p_request_id: requestId, p_reason: reason.trim() })
  if (error) throw new Error(error.message)
}
