import { supabase } from '../../lib/supabase'

export type CommunityNotification = {
  id: string
  resource_type: 'announcement' | 'disaster_advisory' | 'resident_profile_change' | 'document_request' | 'community_feedback' | 'meeting_update' | 'meeting_resolution' | 'health_outreach_cancellation' | 'health_outreach_completion' | 'health_outreach_review' | 'health_outreach_published' | 'health_outreach_review_submission' | 'health_outreach_rescheduled' | 'sk_event_review_submission' | 'sk_event_published' | 'sk_event_review_feedback' | 'sk_event_cancelled' | 'sk_event_rescheduled' | 'sk_event_completed' | 'incident_assignment' | 'incident_status_change' | 'patrol_shift_assignment' | 'patrol_shift_cancelled' | 'patrol_shift_rescheduled' | 'patrol_shift_started' | 'patrol_shift_completed' | 'support_ticket_update' | 'committee_task_update' | 'committee_task_progress' | 'committee_due_date_request' | 'attendance_correction_request'
  resource_id: string
  created_at: string
  read_at: string | null
}

export type CommunityNotificationPreference = {
  resource_type: 'announcement' | 'disaster_advisory' | 'meeting_update' | 'health_outreach_update' | 'sk_event_update'
  enabled: boolean
}

export const COMMUNITY_NOTIFICATION_PAGE_SIZE = 50

export type CommunityNotificationPage = {
  rows: CommunityNotification[]
  totalCount: number
}

export type MeetingUpdateNotificationDetail = {
  event_id: string
  meeting_id: string
  title: string
  location: string
  starts_at: string
  ends_at: string | null
  page_number: number
  changed_fields: string[]
  reason: string | null
}

export type MeetingResolutionNotificationDetail = {
  resolution_id: string
  meeting_id: string
  page_number: number
}

export type HealthOutreachNotificationDetail = {
  campaign_id: string
  title: string
  status: 'published' | 'cancelled' | 'completed'
  cancellation_reason: string | null
  attendance_count: number | null
  page_number: number
}

export type HealthOutreachRescheduleDetail = {
  campaign_id: string; title: string; status: 'published' | 'completed' | 'cancelled'
  new_location: string; new_starts_at: string; new_ends_at: string
  previous_location: string; previous_starts_at: string; previous_ends_at: string
  reason: string; page_number: number
}

export type HealthOutreachReviewNotificationDetail = {
  event_id: string
  campaign_id: string
  title: string
  review_note: string
  campaign_status: 'draft' | 'changes_requested' | 'published' | 'completed' | 'cancelled'
  page_number: number
}

export type HealthOutreachReviewSubmissionDetail = {
  campaign_id: string
  title: string
  page_number: number
}

export type SkEventReviewSubmissionDetail = {
  event_id: string
  title: string
  page_number: number
}

export type SkEventPublicationDetail = {
  event_id: string
  title: string
  status: 'published' | 'completed'
  page_number: number
}

export type SkEventCompletionDetail = {
  event_id: string
  title: string
  page_number: number
}

export type SkEventReviewFeedbackDetail = {
  event_id: string
  title: string
  review_note: string
  page_number: number
}

export type SkEventCancellationDetail = {
  event_id: string
  title: string
  cancellation_reason: string
  page_number: number
}

export type SkEventRescheduleDetail = {
  event_id: string
  title: string
  status: 'published' | 'completed' | 'cancelled'
  location: string
  starts_at: string
  ends_at: string
  previous_location: string
  previous_starts_at: string
  previous_ends_at: string
  reason: string
  page_number: number
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

export async function listMeetingUpdateNotificationDetails(eventIds: string[]): Promise<MeetingUpdateNotificationDetail[]> {
  if (!eventIds.length) return []
  const details: MeetingUpdateNotificationDetail[] = []
  for (let offset = 0; offset < eventIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_meeting_update_details', { p_event_ids: eventIds.slice(offset, offset + 250) })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as MeetingUpdateNotificationDetail[]))
  }
  return details
}

export async function listMeetingResolutionNotificationDetails(resolutionIds: string[]): Promise<MeetingResolutionNotificationDetail[]> {
  if (!resolutionIds.length) return []
  const details: MeetingResolutionNotificationDetail[] = []
  for (let offset = 0; offset < resolutionIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_meeting_resolution_notification_details', {
      p_resolution_ids: resolutionIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as MeetingResolutionNotificationDetail[]))
  }
  return details
}

export async function listHealthOutreachUpdateDetails(tenantId: string, campaignIds: string[]): Promise<HealthOutreachNotificationDetail[]> {
  if (!campaignIds.length) return []
  const details: HealthOutreachNotificationDetail[] = []
  for (let offset = 0; offset < campaignIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_health_outreach_update_details', {
      p_barangay_id: tenantId,
      p_campaign_ids: campaignIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as HealthOutreachNotificationDetail[]))
  }
  return details
}

export async function listHealthOutreachRescheduleDetails(tenantId: string, campaignIds: string[]): Promise<HealthOutreachRescheduleDetail[]> {
  if (!campaignIds.length) return []
  const details: HealthOutreachRescheduleDetail[] = []
  for (let offset = 0; offset < campaignIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_rescheduled_health_outreach_notification_details', {
      p_barangay_id: tenantId, p_campaign_ids: campaignIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as HealthOutreachRescheduleDetail[]))
  }
  return details
}

export async function listHealthOutreachReviewDetails(tenantId: string, eventIds: string[]): Promise<HealthOutreachReviewNotificationDetail[]> {
  if (!eventIds.length) return []
  const details: HealthOutreachReviewNotificationDetail[] = []
  for (let offset = 0; offset < eventIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_health_outreach_review_details', {
      p_barangay_id: tenantId,
      p_event_ids: eventIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as HealthOutreachReviewNotificationDetail[]))
  }
  return details
}

export async function listHealthOutreachReviewSubmissionDetails(tenantId: string, campaignIds: string[]): Promise<HealthOutreachReviewSubmissionDetail[]> {
  if (!campaignIds.length) return []
  const details: HealthOutreachReviewSubmissionDetail[] = []
  for (let offset = 0; offset < campaignIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_health_outreach_review_submission_details', {
      p_barangay_id: tenantId,
      p_campaign_ids: campaignIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as HealthOutreachReviewSubmissionDetail[]))
  }
  return details
}

export async function listSkEventReviewSubmissionDetails(tenantId: string, eventIds: string[]): Promise<SkEventReviewSubmissionDetail[]> {
  if (!eventIds.length) return []
  const details: SkEventReviewSubmissionDetail[] = []
  for (let offset = 0; offset < eventIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_sk_event_review_submission_details', {
      p_barangay_id: tenantId,
      p_event_ids: eventIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as SkEventReviewSubmissionDetail[]))
  }
  return details
}

export async function listSkEventPublicationDetails(tenantId: string, eventIds: string[]): Promise<SkEventPublicationDetail[]> {
  if (!eventIds.length) return []
  const details: SkEventPublicationDetail[] = []
  for (let offset = 0; offset < eventIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_published_sk_event_notification_details', {
      p_barangay_id: tenantId,
      p_event_ids: eventIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as SkEventPublicationDetail[]))
  }
  return details
}

export async function listSkEventCompletionDetails(tenantId: string, eventIds: string[]): Promise<SkEventCompletionDetail[]> {
  if (!eventIds.length) return []
  const details: SkEventCompletionDetail[] = []
  for (let offset = 0; offset < eventIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_completed_sk_event_notification_details', {
      p_barangay_id: tenantId,
      p_event_ids: eventIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as SkEventCompletionDetail[]))
  }
  return details
}

export async function listSkEventReviewFeedbackDetails(tenantId: string, eventIds: string[]): Promise<SkEventReviewFeedbackDetail[]> {
  if (!eventIds.length) return []
  const details: SkEventReviewFeedbackDetail[] = []
  for (let offset = 0; offset < eventIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_sk_event_review_feedback_details', {
      p_barangay_id: tenantId,
      p_event_ids: eventIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as SkEventReviewFeedbackDetail[]))
  }
  return details
}

export async function listSkEventCancellationDetails(tenantId: string, eventIds: string[]): Promise<SkEventCancellationDetail[]> {
  if (!eventIds.length) return []
  const details: SkEventCancellationDetail[] = []
  for (let offset = 0; offset < eventIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_cancelled_sk_event_notification_details', {
      p_barangay_id: tenantId,
      p_event_ids: eventIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as SkEventCancellationDetail[]))
  }
  return details
}

export async function listSkEventRescheduleDetails(tenantId: string, eventIds: string[]): Promise<SkEventRescheduleDetail[]> {
  if (!eventIds.length) return []
  const details: SkEventRescheduleDetail[] = []
  for (let offset = 0; offset < eventIds.length; offset += 250) {
    const { data, error } = await client().rpc('list_my_rescheduled_sk_event_notification_details', {
      p_barangay_id: tenantId,
      p_event_ids: eventIds.slice(offset, offset + 250),
    })
    if (error) throw new Error(error.message)
    details.push(...((data ?? []) as SkEventRescheduleDetail[]))
  }
  return details
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
