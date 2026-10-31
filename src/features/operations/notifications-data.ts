import { supabase } from '../../lib/supabase'

export type CommunityNotification = {
  id: string
  resource_type: 'announcement' | 'disaster_advisory' | 'resident_profile_change' | 'document_request' | 'community_feedback'
  resource_id: string
  created_at: string
  read_at: string | null
}

export type CommunityNotificationPreference = {
  resource_type: 'announcement' | 'disaster_advisory'
  enabled: boolean
}

export const COMMUNITY_NOTIFICATION_PAGE_SIZE = 50

export type CommunityNotificationPage = {
  rows: CommunityNotification[]
  totalCount: number
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listCommunityNotificationPage(tenantId: string, page: number): Promise<CommunityNotificationPage> {
  const from = Math.max(0, page) * COMMUNITY_NOTIFICATION_PAGE_SIZE
  const to = from + COMMUNITY_NOTIFICATION_PAGE_SIZE - 1
  const { data, error, count } = await client().from('community_notifications')
    .select('id,resource_type,resource_id,created_at,read_at', { count: 'exact' })
    .eq('barangay_id', tenantId)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, to)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as CommunityNotification[], totalCount: count ?? 0 }
}

export async function countUnreadCommunityNotifications(tenantId: string): Promise<number> {
  const { count, error } = await client().from('community_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('barangay_id', tenantId)
    .is('read_at', null)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function markCommunityNotificationRead(notificationId: string, tenantId: string) {
  const { error } = await client().from('community_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId).eq('barangay_id', tenantId).is('read_at', null)
  if (error) throw new Error(error.message)
}

export async function markAllCommunityNotificationsRead(tenantId: string) {
  const { error } = await client().from('community_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('barangay_id', tenantId).is('read_at', null)
  if (error) throw new Error(error.message)
}

export async function listCommunityNotificationPreferences(tenantId: string, userId: string): Promise<CommunityNotificationPreference[]> {
  const { data, error } = await client().from('community_notification_preferences')
    .select('resource_type,enabled').eq('barangay_id', tenantId).eq('user_id', userId)
  if (error) throw new Error(error.message)
  return (data ?? []) as CommunityNotificationPreference[]
}

export async function saveCommunityNotificationPreference(input: {
  tenantId: string; userId: string; resourceType: CommunityNotificationPreference['resource_type']; enabled: boolean
}) {
  const { error } = await client().from('community_notification_preferences').upsert({
    barangay_id: input.tenantId, user_id: input.userId, resource_type: input.resourceType,
    enabled: input.enabled,
  }, { onConflict: 'user_id,barangay_id,resource_type' })
  if (error) throw new Error(error.message)
}
