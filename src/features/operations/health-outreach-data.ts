import { supabase } from '../../lib/supabase'

export type HealthCampaign = {
  id: string
  barangay_id: string
  title: string
  description: string
  location: string
  starts_at: string
  ends_at: string
  status: 'draft' | 'published' | 'completed' | 'cancelled'
  created_by: string
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  completed_at: string | null
}
export type HealthCampaignPage = { rows: HealthCampaign[]; totalCount: number }
export const HEALTH_CAMPAIGN_PAGE_SIZE = 20

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listHealthCampaigns(barangayId: string, page: number): Promise<HealthCampaignPage> {
  const from = page * HEALTH_CAMPAIGN_PAGE_SIZE
  const { data, error, count } = await client().from('health_outreach_campaigns')
    .select('*', { count: 'exact' })
    .eq('barangay_id', barangayId)
    .order('starts_at')
    .order('id')
    .range(from, from + HEALTH_CAMPAIGN_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as HealthCampaign[], totalCount: count ?? 0 }
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
}

export function createHealthCampaign(input: { barangayId: string; title: string; description: string; location: string; startsAt: string; endsAt: string }) {
  return rpc('create_health_outreach_campaign', { p_barangay_id: input.barangayId, p_title: input.title, p_description: input.description, p_location: input.location, p_starts_at: input.startsAt, p_ends_at: input.endsAt })
}

export function reviewHealthCampaign(id: string, approve: boolean, note: string | null) {
  return rpc('review_health_outreach_campaign', { p_campaign_id: id, p_approve: approve, p_note: note })
}

export function completeHealthCampaign(id: string) {
  return rpc('complete_health_outreach_campaign', { p_campaign_id: id })
}
