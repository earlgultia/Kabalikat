import { supabase } from '../../lib/supabase'

export type SkEvent = {
  id: string; barangay_id: string; title: string; description: string; location: string
  starts_at: string; ends_at: string; status: 'draft' | 'published' | 'completed' | 'cancelled'
  created_by: string; created_at: string; reviewed_by: string | null; reviewed_at: string | null
  review_note: string | null; completed_at: string | null
}
export type SkEventAuditEntry = { id: string; event_id: string; action: 'event_created' | 'event_published' | 'event_rejected' | 'event_completed'; note: string; created_at: string }
export const SK_EVENT_PAGE_SIZE = 20
export const SK_EVENT_HISTORY_PAGE_SIZE = 25

function client() { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }

export async function listSkEvents(barangayId: string, page: number) {
  const from = Math.max(0, page) * SK_EVENT_PAGE_SIZE
  const { data, count, error } = await client().from('sk_events').select('*', { count: 'exact' })
    .eq('barangay_id', barangayId).order('starts_at').order('id').range(from, from + SK_EVENT_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as SkEvent[], totalCount: count ?? 0 }
}

export async function listSkEventAudit(barangayId: string, eventId: string, page: number) {
  const from = Math.max(0, page) * SK_EVENT_HISTORY_PAGE_SIZE
  const { data, count, error } = await client().from('sk_event_events').select('id,event_id,action,note,created_at', { count: 'exact' })
    .eq('barangay_id', barangayId).eq('event_id', eventId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + SK_EVENT_HISTORY_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as SkEventAuditEntry[], totalCount: count ?? 0 }
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
