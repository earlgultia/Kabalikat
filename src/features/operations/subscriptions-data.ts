import { supabase } from '../../lib/supabase'

export type SubscriptionPlan = { id: string; key: string; name: string; description: string; entitlements: Record<string, unknown>; active: boolean }
export type SubscriptionOverviewRow = {
  barangay_id: string; barangay_name: string; barangay_code: string; plan_key: string; plan_name: string; plan_entitlements: Record<string, unknown>
  status: string; started_at: string; trial_ends_at: string | null; grace_ends_at: string | null; admin_note: string; updated_at: string
}
export type SubscriptionEvent = {
  id: string; action: 'subscription_created' | 'subscription_updated'; from_plan: string | null; to_plan: string
  from_status: string | null; to_status: string; note: string; created_at: string
}

export const SUBSCRIPTION_EVENT_PAGE_SIZE = 25
export const SUBSCRIPTION_PAGE_SIZE = 25
export type SubscriptionSummary = {
  barangay_count: number; active_trial_count: number; elapsed_trial_count: number
  past_due_count: number; suspended_count: number; needs_review_count: number
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await client().rpc('get_platform_subscription_plans')
  if (error) throw new Error(error.message)
  return (data ?? []) as SubscriptionPlan[]
}

export async function listSubscriptionPage(input: { page: number; search: string; status: string }) {
  const { data, error } = await client().rpc('list_platform_subscription_page', {
    p_page: Math.max(input.page, 0), p_page_size: SUBSCRIPTION_PAGE_SIZE,
    p_search: input.search.trim() || null, p_status: input.status,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as (SubscriptionOverviewRow & { total_count: number })[]
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export async function getSubscriptionSummary(): Promise<SubscriptionSummary> {
  const { data, error } = await client().rpc('get_platform_subscription_summary')
  if (error) throw new Error(error.message)
  return (data?.[0] ?? { barangay_count: 0, active_trial_count: 0, elapsed_trial_count: 0, past_due_count: 0, suspended_count: 0, needs_review_count: 0 }) as SubscriptionSummary
}

export async function listSubscriptionEvents(barangayId: string, page: number) {
  const db = client()
  const { data: subscription, error: subscriptionError } = await db.from('subscriptions').select('id').eq('barangay_id', barangayId).maybeSingle()
  if (subscriptionError) throw new Error(subscriptionError.message)
  if (!subscription) return { events: [] as SubscriptionEvent[], total: 0 }
  const from = Math.max(0, page) * SUBSCRIPTION_EVENT_PAGE_SIZE
  const { data, error, count } = await db.from('subscription_events')
    .select('id,action,from_plan,to_plan,from_status,to_status,note,created_at', { count: 'exact' })
    .eq('subscription_id', subscription.id).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + SUBSCRIPTION_EVENT_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { events: (data ?? []) as SubscriptionEvent[], total: count ?? 0 }
}

export async function setSubscription(input: { barangayId: string; planKey: string; status: string; trialDays: number; graceDays: number; note: string }) {
  const { error } = await client().rpc('set_platform_subscription', {
    p_barangay_id: input.barangayId, p_plan_key: input.planKey, p_status: input.status,
    p_trial_days: input.trialDays, p_grace_days: input.graceDays, p_note: input.note,
  })
  if (error) throw new Error(error.message)
}
