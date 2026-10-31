import { supabase } from '../../lib/supabase'

export type SkEvent = {
  id: string; barangay_id: string; title: string; description: string; location: string
  starts_at: string; ends_at: string; status: 'draft' | 'changes_requested' | 'published' | 'completed' | 'cancelled'
  created_by: string; created_at: string; reviewed_by: string | null; reviewed_at: string | null
  review_note: string | null; completed_at: string | null
}
export type SkEventAuditEntry = { id: string; event_id: string; action: 'event_created' | 'event_published' | 'event_rejected' | 'event_completed' | 'event_changes_requested' | 'event_updated' | 'event_resubmitted' | 'event_cancelled' | 'event_rescheduled'; note: string; created_at: string }
export type SkEventQueueSummary = { totalCount: number; awaitingReviewCount: number; changesRequestedCount: number; publishedCount: number; completedCount: number; cancelledCount: number }
export type SkEventScheduleChange = { id: string; reason: string; previous_location: string; previous_starts_at: string; previous_ends_at: string; new_location: string; new_starts_at: string; new_ends_at: string; created_at: string; total_count: number }
export type SkEventNotificationSummary = { publication_sent: number; publication_read: number; schedule_update_sent: number; schedule_update_read: number; cancellation_sent: number; cancellation_read: number }
export const SK_EVENT_PAGE_SIZE = 20
export const SK_EVENT_HISTORY_PAGE_SIZE = 25
export const SK_EVENT_SCHEDULE_HISTORY_PAGE_SIZE = 10

function client() { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }

export async function listSkEvents(barangayId: string, page: number, search: string, status: 'all' | SkEvent['status']) {
  const { data, error } = await client().rpc('list_sk_event_page', {
    p_barangay_id: barangayId,
    p_page: page,
    p_page_size: SK_EVENT_PAGE_SIZE,
    p_search: search.trim().slice(0, 100) || null,
    p_status: status,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as (SkEvent & { total_count: number })[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function getSkEventQueueSummary(barangayId: string, search: string, status: 'all' | SkEvent['status']): Promise<SkEventQueueSummary> {
  const { data, error } = await client().rpc('get_sk_event_queue_summary', {
    p_barangay_id: barangayId,
    p_search: search.trim().slice(0, 100) || null,
    p_status: status,
  })
  if (error) throw new Error(error.message)
  const row = data?.[0] as { total_count: number; awaiting_review_count: number; changes_requested_count: number; published_count: number; completed_count: number; cancelled_count: number } | undefined
  return {
    totalCount: Number(row?.total_count ?? 0),
    awaitingReviewCount: Number(row?.awaiting_review_count ?? 0),
    changesRequestedCount: Number(row?.changes_requested_count ?? 0),
    publishedCount: Number(row?.published_count ?? 0),
    completedCount: Number(row?.completed_count ?? 0),
    cancelledCount: Number(row?.cancelled_count ?? 0),
  }
}

export async function listSkEventAudit(barangayId: string, eventId: string, page: number) {
  const from = Math.max(0, page) * SK_EVENT_HISTORY_PAGE_SIZE
  const { data, count, error } = await client().from('sk_event_events').select('id,event_id,action,note,created_at', { count: 'exact' })
    .eq('barangay_id', barangayId).eq('event_id', eventId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + SK_EVENT_HISTORY_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as SkEventAuditEntry[], totalCount: count ?? 0 }
}

export async function listSkEventScheduleChanges(barangayId: string, eventId: string, page: number) {
  const { data, error } = await client().rpc('list_sk_event_schedule_change_history', {
    p_barangay_id: barangayId,
    p_event_id: eventId,
    p_page: page,
    p_page_size: SK_EVENT_SCHEDULE_HISTORY_PAGE_SIZE,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as SkEventScheduleChange[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function getSkEventNotificationSummary(barangayId: string, eventId: string): Promise<SkEventNotificationSummary> {
  const { data, error } = await client().rpc('get_sk_event_notification_summary', {
    p_barangay_id: barangayId,
    p_event_id: eventId,
  })
  if (error) throw new Error(error.message)
  const row = data?.[0] as SkEventNotificationSummary | undefined
  return {
    publication_sent: Number(row?.publication_sent ?? 0),
    publication_read: Number(row?.publication_read ?? 0),
    schedule_update_sent: Number(row?.schedule_update_sent ?? 0),
    schedule_update_read: Number(row?.schedule_update_read ?? 0),
    cancellation_sent: Number(row?.cancellation_sent ?? 0),
    cancellation_read: Number(row?.cancellation_read ?? 0),
  }
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
}

export function createSkEvent(input: { barangayId: string; title: string; description: string; location: string; startsAt: string; endsAt: string }) {
  return rpc('create_sk_event', { p_barangay_id: input.barangayId, p_title: input.title, p_description: input.description, p_location: input.location, p_starts_at: input.startsAt, p_ends_at: input.endsAt })
}
export function reviewSkEvent(id: string, approve: boolean, note: string | null) { return rpc('review_sk_event', { p_event_id: id, p_approve: approve, p_note: note }) }
export function completeSkEvent(id: string) { return rpc('complete_sk_event', { p_event_id: id }) }
export function cancelSkEvent(id: string, reason: string) { return rpc('cancel_sk_event', { p_event_id: id, p_reason: reason }) }
export function rescheduleSkEvent(input: { id: string; location: string; startsAt: string; endsAt: string; reason: string }) {
  return rpc('reschedule_sk_event', { p_event_id: input.id, p_new_location: input.location, p_new_starts_at: input.startsAt, p_new_ends_at: input.endsAt, p_reason: input.reason })
}
export function updateSkEvent(input: { id: string; title: string; description: string; location: string; startsAt: string; endsAt: string }) {
  return rpc('update_sk_event', { p_event_id: input.id, p_title: input.title, p_description: input.description, p_location: input.location, p_starts_at: input.startsAt, p_ends_at: input.endsAt })
}
