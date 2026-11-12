import { supabase } from '../../lib/supabase'

const visitorStorageKey = 'kabalikat.public-site-visitor-id'
const optOutStorageKey = 'kabalikat.public-site-analytics-opt-out'
let volatileVisitorId: string | null = null
let volatileOptOut = false

export const publicSiteSections = ['home', 'features', 'plans', 'how-it-works', 'privacy'] as const
export type PublicSiteSection = typeof publicSiteSections[number]

export type PublicVisitorMetrics = {
  total_visitors: number
  today_visitors: number
  total_page_views: number
  live_visitors: number
  updated_at: string
}

export function isSiteAnalyticsOptedOut() {
  try { return window.localStorage.getItem(optOutStorageKey) === 'true' || volatileOptOut } catch { return volatileOptOut }
}

export function setSiteAnalyticsOptOut(optedOut: boolean) {
  volatileOptOut = optedOut
  try {
    if (optedOut) window.localStorage.setItem(optOutStorageKey, 'true')
    else window.localStorage.removeItem(optOutStorageKey)
  } catch { /* Browser privacy settings may disable local storage. */ }
}

function createVisitorId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0
    return (char === 'x' ? random : (random & 0x3 | 0x8)).toString(16)
  })
}

export function getPublicSiteVisitorId() {
  try {
    const existing = window.localStorage.getItem(visitorStorageKey)
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing
    const next = createVisitorId()
    window.localStorage.setItem(visitorStorageKey, next)
    return next
  } catch {
    volatileVisitorId ??= createVisitorId()
    return volatileVisitorId
  }
}

export async function trackPublicSiteHeartbeat(visitorId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('track_site_visitor_heartbeat', { p_visitor_id: visitorId })
  if (error) throw error
}

export async function trackPublicSitePageView(visitorId: string, pageKey: PublicSiteSection) {
  if (!supabase) return
  const { error } = await supabase.rpc('track_site_page_view', { p_visitor_id: visitorId, p_page_key: pageKey })
  if (error) throw error
}

export async function getPublicSiteVisitorMetrics(): Promise<PublicVisitorMetrics> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('get_public_site_visitor_metrics')
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result) throw new Error('Visitor metrics are unavailable')
  return result as PublicVisitorMetrics
}
