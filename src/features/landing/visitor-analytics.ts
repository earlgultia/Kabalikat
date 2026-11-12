import { supabase } from '../../lib/supabase'

const visitorStorageKey = 'kabalikat.public-site-visitor-id'
const visitorIdPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i
export const siteAnalyticsOptOutStorageKey = 'kabalikat.public-site-analytics-opt-out'
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
  try {
    if (window.localStorage.getItem(siteAnalyticsOptOutStorageKey) === 'true') return true
  } catch { /* Use session storage when persistent storage is blocked. */ }
  try {
    volatileOptOut = window.sessionStorage.getItem(siteAnalyticsOptOutStorageKey) === 'true'
    return volatileOptOut
  } catch { return volatileOptOut }
}

export function setSiteAnalyticsOptOut(optedOut: boolean) {
  volatileOptOut = optedOut
  let persistentStorageAvailable = false
  try {
    if (optedOut) window.localStorage.setItem(siteAnalyticsOptOutStorageKey, 'true')
    else window.localStorage.removeItem(siteAnalyticsOptOutStorageKey)
    persistentStorageAvailable = true
  } catch { /* Fall back to a tab-session preference when persistent storage is blocked. */ }
  try {
    if (!persistentStorageAvailable && optedOut) window.sessionStorage.setItem(siteAnalyticsOptOutStorageKey, 'true')
    else window.sessionStorage.removeItem(siteAnalyticsOptOutStorageKey)
  } catch { /* Browser privacy settings may disable both storage types. */ }
  if (optedOut) {
    volatileVisitorId = null
    try { window.localStorage.removeItem(visitorStorageKey) } catch { /* Persistent storage may be blocked. */ }
    try { window.sessionStorage.removeItem(visitorStorageKey) } catch { /* Session storage may be blocked. */ }
  }
}

function createVisitorId() {
  const cryptoApi = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0
    return (char === 'x' ? random : (random & 0x3 | 0x8)).toString(16)
  })
}

export function getPublicSiteVisitorId() {
  try {
    const existing = window.localStorage.getItem(visitorStorageKey)
    if (existing && visitorIdPattern.test(existing)) return existing
    const next = createVisitorId()
    window.localStorage.setItem(visitorStorageKey, next)
    return next
  } catch {
    try {
      const existing = window.sessionStorage.getItem(visitorStorageKey)
      if (existing && visitorIdPattern.test(existing)) return existing
      const next = createVisitorId()
      window.sessionStorage.setItem(visitorStorageKey, next)
      return next
    } catch {
      volatileVisitorId ??= createVisitorId()
      return volatileVisitorId
    }
  }
}

export async function trackPublicSiteHeartbeat(visitorId: string) {
  if (isSiteAnalyticsOptedOut() || !supabase) return
  const { error } = await supabase.rpc('track_site_visitor_heartbeat', { p_visitor_id: visitorId })
  if (error) throw error
}

export async function trackPublicSitePageView(visitorId: string, pageKey: PublicSiteSection) {
  if (isSiteAnalyticsOptedOut() || !supabase) return
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
