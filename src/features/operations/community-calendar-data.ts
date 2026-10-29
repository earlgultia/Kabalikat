import { supabase } from '../../lib/supabase'

export type CommunityCalendarItem = {
  id: string
  title: string
  description: string
  location: string
  starts_at: string
  ends_at: string
  source: 'sk' | 'health'
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listUpcomingCommunityEvents(barangayId: string, limitPerSource?: number): Promise<CommunityCalendarItem[]> {
  const now = new Date().toISOString()
  const skQuery = client().from('sk_events').select('id,title,description,location,starts_at,ends_at')
    .eq('barangay_id', barangayId).eq('status', 'published').gte('ends_at', now).order('starts_at')
  const healthQuery = client().from('health_outreach_campaigns').select('id,title,description,location,starts_at,ends_at')
    .eq('barangay_id', barangayId).eq('status', 'published').gte('ends_at', now).order('starts_at')
  const [skResult, healthResult] = await Promise.all([
    limitPerSource === undefined ? skQuery : skQuery.limit(Math.max(1, Math.floor(limitPerSource))),
    limitPerSource === undefined ? healthQuery : healthQuery.limit(Math.max(1, Math.floor(limitPerSource))),
  ])
  if (skResult.error) throw new Error(skResult.error.message)
  if (healthResult.error) throw new Error(healthResult.error.message)
  const skEvents = (skResult.data ?? []).map((item) => ({ ...item, source: 'sk' as const }))
  const healthEvents = (healthResult.data ?? []).map((item) => ({ ...item, source: 'health' as const }))
  return [...skEvents, ...healthEvents].sort((left, right) => left.starts_at.localeCompare(right.starts_at))
}
