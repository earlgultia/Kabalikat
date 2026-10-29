import { supabase } from '../../lib/supabase'

export type CommunityNotification = {
  id: string
  resource_type: 'announcement' | 'disaster_advisory' | 'resident_profile_change' | 'document_request'
  resource_id: string
  created_at: string
  read_at: string | null
}

export type CommunityNotificationPreference = {
  resource_type: 'announcement' | 'disaster_advisory'
  enabled: boolean
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listCommunityNotifications(tenantId: string): Promise<CommunityNotification[]> {
  const { data, error } = await client().from('community_notifications')
    .select('id,resource_type,resource_id,created_at,read_at')
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []) as CommunityNotification[]
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
