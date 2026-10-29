import { supabase } from '../../lib/supabase'

export type SubscriptionPlan = { id: string; key: string; name: string; description: string; entitlements: Record<string, unknown>; active: boolean }
export type SubscriptionOverviewRow = {
  barangay_id: string; barangay_name: string; barangay_code: string; plan_key: string; plan_name: string; plan_entitlements: Record<string, unknown>
  status: string; started_at: string; trial_ends_at: string | null; grace_ends_at: string | null; admin_note: string; updated_at: string
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

export async function listSubscriptionOverview(): Promise<SubscriptionOverviewRow[]> {
  const { data, error } = await client().rpc('get_platform_subscription_overview')
  if (error) throw new Error(error.message)
  return (data ?? []) as SubscriptionOverviewRow[]
}

export async function setSubscription(input: { barangayId: string; planKey: string; status: string; trialDays: number; graceDays: number; note: string }) {
  const { error } = await client().rpc('set_platform_subscription', {
    p_barangay_id: input.barangayId, p_plan_key: input.planKey, p_status: input.status,
    p_trial_days: input.trialDays, p_grace_days: input.graceDays, p_note: input.note,
  })
  if (error) throw new Error(error.message)
}
