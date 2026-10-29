import { supabase } from '../../lib/supabase'

export type CommunityFeedback = {
  id: string; category: 'service' | 'suggestion' | 'accessibility' | 'other'; subject: string
  message: string; status: 'submitted' | 'in_review' | 'responded' | 'closed'; staff_response: string | null
  responded_at: string | null; created_at: string; updated_at: string
}
export type CommunityFeedbackStatus = CommunityFeedback['status']
export type CommunityFeedbackEvent = {
  id: string; feedback_id: string; action: 'submitted' | 'review_started' | 'responded' | 'closed'; created_at: string
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listCommunityFeedback(tenantId: string, page: number, status: CommunityFeedbackStatus | 'all', search = ''): Promise<CommunityFeedback[]> {
  let query = client().from('community_feedback')
    .select('id,category,subject,message,status,staff_response,responded_at,created_at,updated_at')
    .eq('barangay_id', tenantId)
  if (status !== 'all') query = query.eq('status', status)
  const term = search.trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(term)) query = query.eq('id', term)
  else if (term) query = query.ilike('subject', `%${term.replace(/[\\%_]/g, '\\$&')}%`)
  const { data, error } = await query.order('created_at', { ascending: false }).range(page * 100, (page + 1) * 100 - 1)
  if (error) throw new Error(error.message)
  return (data ?? []) as CommunityFeedback[]
}

export async function listCommunityFeedbackEvents(tenantId: string, feedbackIds: string[]): Promise<CommunityFeedbackEvent[]> {
  if (!feedbackIds.length) return []
  const { data, error } = await client().from('community_feedback_events')
    .select('id,feedback_id,action,created_at')
    .eq('barangay_id', tenantId).in('feedback_id', feedbackIds)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as CommunityFeedbackEvent[]
}

export async function submitCommunityFeedback(input: { tenantId: string; category: string; subject: string; message: string }) {
  const { data, error } = await client().rpc('submit_community_feedback', {
    p_barangay_id: input.tenantId, p_category: input.category, p_subject: input.subject, p_message: input.message,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function updateCommunityFeedback(id: string, status: 'in_review' | 'responded' | 'closed', response = '') {
  const { error } = await client().rpc('update_community_feedback', {
    p_feedback_id: id, p_next_status: status, p_response: response || null,
  })
  if (error) throw new Error(error.message)
}
