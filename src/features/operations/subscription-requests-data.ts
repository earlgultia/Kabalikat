import { supabase } from '../../lib/supabase'

export type AvailableSubscriptionPlan = { plan_key: string; plan_name: string; plan_description: string }
export type TenantSubscriptionStatus = { plan_key: string; plan_name: string; subscription_status: string; updated_at: string }
export type TenantPlanRequest = {
  request_id: string; plan_key: string; plan_name: string; plan_description: string
  status: 'pending' | 'activated' | 'declined'; request_note: string; admin_note: string
  created_at: string; reviewed_at: string | null
}
export type PlatformPlanRequest = {
  request_id: string; barangay_id: string; barangay_name: string; barangay_code: string
  plan_key: string; plan_name: string; requester_name: string; request_note: string
  status: 'pending' | 'activated' | 'declined'; admin_note: string; created_at: string
  reviewed_at: string | null; total_count: number
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listAvailableSubscriptionPlans() {
  const { data, error } = await client().rpc('list_available_subscription_plans')
  if (error) throw new Error(error.message)
  return (data ?? []) as AvailableSubscriptionPlan[]
}

export async function getTenantSubscriptionStatus(barangayId: string) {
  const { data, error } = await client().rpc('get_barangay_subscription_plan_status', { p_barangay_id: barangayId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as TenantSubscriptionStatus[])[0] ?? null
}

export async function listTenantPlanRequests(barangayId: string) {
  const { data, error } = await client().rpc('list_barangay_subscription_plan_requests', { p_barangay_id: barangayId })
  if (error) throw new Error(error.message)
  return (data ?? []) as TenantPlanRequest[]
}

export async function requestTenantSubscriptionPlan(barangayId: string, planKey: string, note: string) {
  const { data, error } = await client().rpc('request_barangay_subscription_plan', {
    p_barangay_id: barangayId, p_plan_key: planKey, p_request_note: note,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export const PLATFORM_PLAN_REQUEST_PAGE_SIZE = 20

export async function listPlatformPlanRequests(page: number, status: string) {
  const { data, error } = await client().rpc('list_platform_subscription_plan_requests', {
    p_page: page, p_page_size: PLATFORM_PLAN_REQUEST_PAGE_SIZE, p_status: status,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as PlatformPlanRequest[]
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function activatePlanRequest(requestId: string) {
  const { error } = await client().rpc('activate_subscription_plan_request', {
    p_request_id: requestId,
  })
  if (error) throw new Error(error.message)
  await verifyPlanRequestStatus(requestId, 'activated')
}

export async function declinePlanRequest(requestId: string, reason: string) {
  const { error } = await client().rpc('decline_subscription_plan_request', {
    p_request_id: requestId, p_reason: reason,
  })
  if (error) throw new Error(error.message)
  await verifyPlanRequestStatus(requestId, 'declined')
}

async function verifyPlanRequestStatus(requestId: string, expectedStatus: 'activated' | 'declined') {
  const { data, error } = await client()
    .from('subscription_plan_requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle()
  if (error) throw new Error(`Decision was sent, but its saved status could not be verified: ${error.message}`)
  if (data?.status !== expectedStatus) {
    throw new Error(`The request is still marked ${data?.status ?? 'unknown'}. Apply the latest subscription request migration, then retry.`)
  }
}
