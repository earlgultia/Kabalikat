import { supabase } from '../../lib/supabase'

export type SkEvent = {
  id: string; barangay_id: string; title: string; description: string; location: string
  starts_at: string; ends_at: string; status: 'draft' | 'published' | 'completed' | 'cancelled'
  created_by: string; created_at: string; reviewed_by: string | null; reviewed_at: string | null
  review_note: string | null; completed_at: string | null
}
export type SkEventAuditEntry = { id: string; event_id: string; action: 'event_created' | 'event_published' | 'event_rejected' | 'event_completed'; note: string; created_at: string }

function client() { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }

export async function listSkEvents(barangayId: string) {
  const { data, error } = await client().from('sk_events').select('*').eq('barangay_id', barangayId).order('starts_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as SkEvent[]
}

export async function listSkEventAudit(barangayId: string): Promise<SkEventAuditEntry[]> {
  const { data, error } = await client().from('sk_event_events').select('id,event_id,action,note,created_at')
    .eq('barangay_id', barangayId).order('created_at', { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as SkEventAuditEntry[]
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
