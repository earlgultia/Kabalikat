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

export const COMMUNITY_CALENDAR_PAGE_SIZE = 20

export async function listCommunityEventPage(barangayId: string, page: number, search: string, source: 'all' | CommunityCalendarItem['source']) {
  const { data, error } = await client().rpc('list_community_calendar_page', {
    p_barangay_id: barangayId,
    p_page: page,
    p_page_size: COMMUNITY_CALENDAR_PAGE_SIZE,
    p_search: search.trim().slice(0, 100) || null,
    p_source: source,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as (CommunityCalendarItem & { total_count: number })[]
  return {
    events: rows.map((event) => ({ id: event.id, title: event.title, description: event.description, location: event.location,
      starts_at: event.starts_at, ends_at: event.ends_at, source: event.source })),
    total: Number(rows[0]?.total_count ?? 0),
  }
}

export async function listAllCommunityEvents(barangayId: string, search: string, source: 'all' | CommunityCalendarItem['source'], onProgress?: (message: string) => void) {
  const result: CommunityCalendarItem[] = []
  for (let page = 0; ; page += 1) {
    const batch = await listCommunityEventPage(barangayId, page, search, source)
    result.push(...batch.events)
    onProgress?.(`Gathering calendar events: ${result.length.toLocaleString()} of ${batch.total.toLocaleString()}`)
    if (result.length >= batch.total || batch.events.length === 0) return result
  }
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
