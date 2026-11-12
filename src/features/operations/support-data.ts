import { supabase } from '../../lib/supabase'

export type SupportTicket = { id: string; barangay_id: string; barangay_name?: string; requester_id: string; category: string; subject: string; description: string; status: string; created_at: string; updated_at: string }
export type SupportMessage = { id: string; ticket_id: string; author_id: string; visibility: string; body: string; created_at: string }
export type SupportEvent = { id: string; ticket_id: string; action: string; from_status: string | null; to_status: string | null; created_at: string }
export const SUPPORT_THREAD_PAGE_SIZE = 25
export type SupportQueueSummary = { total_count: number; new_count: number; in_progress_count: number; waiting_on_requester_count: number; resolved_count: number; closed_count: number }

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listSupportTickets(tenantId?: string, page = 0, status = 'all', search = ''): Promise<SupportTicket[]> {
  let query = client().from('support_tickets').select('id,barangay_id,requester_id,category,subject,description,status,created_at,updated_at').order('updated_at', { ascending: false })
  if (tenantId) query = query.eq('barangay_id', tenantId)
  if (status === 'open') query = query.in('status', ['new', 'in_progress', 'waiting_on_requester'])
  else if (status !== 'all') query = query.eq('status', status)
  const term = search.trim()
  if (term) query = query.ilike('subject', `%${term.replace(/[\\%_]/g, '\\$&')}%`)
  const { data, error } = await query.range(page * 50, (page + 1) * 50 - 1)
  if (error) throw new Error(error.message)
  return (data ?? []) as SupportTicket[]
}

export async function countOwnOpenSupportTickets(tenantId: string): Promise<number> {
  const supabaseClient = client()
  const { data: authData, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !authData.user) throw new Error('Sign in again to view your support requests.')
  const { count, error } = await supabaseClient.from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('barangay_id', tenantId)
    .eq('requester_id', authData.user.id)
    .in('status', ['new', 'in_progress', 'waiting_on_requester'])
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function getSupportTicketById(ticketId: string): Promise<SupportTicket | null> {
  const { data, error } = await client().from('support_tickets')
    .select('id,barangay_id,requester_id,category,subject,description,status,created_at,updated_at')
    .eq('id', ticketId).maybeSingle()
  if (error) throw new Error(error.message)
  return data as SupportTicket | null
}

export async function listPlatformSupportTickets(page = 0, status = 'all', search = '', needsAttention = false): Promise<SupportTicket[]> {
  const { data, error } = await client().rpc(needsAttention ? 'list_platform_support_attention_page' : 'list_platform_support_ticket_page', {
    p_page: Math.max(page, 0), p_page_size: 50, p_status: status, p_search: search.trim() || null,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as SupportTicket[]
}

export async function getPlatformSupportAttentionCount(): Promise<number> {
  const { data, error } = await client().rpc('get_platform_support_attention_count')
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

export async function getPlatformSupportQueueSummary(): Promise<SupportQueueSummary> {
  const { data, error } = await client().rpc('get_platform_support_queue_summary')
  if (error) throw new Error(error.message)
  const summary = Array.isArray(data) ? data[0] : data
  return (summary ?? { total_count: 0, new_count: 0, in_progress_count: 0, waiting_on_requester_count: 0, resolved_count: 0, closed_count: 0 }) as SupportQueueSummary
}

export async function listSupportMessages(ticketId: string, page: number) {
  const from = Math.max(0, page) * SUPPORT_THREAD_PAGE_SIZE
  const { data, error, count } = await client().from('support_messages').select('id,ticket_id,author_id,visibility,body,created_at', { count: 'exact' })
    .eq('ticket_id', ticketId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + SUPPORT_THREAD_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { items: (data ?? []) as SupportMessage[], total: count ?? 0 }
}

export async function listSupportEvents(ticketId: string, page: number) {
  const from = Math.max(0, page) * SUPPORT_THREAD_PAGE_SIZE
  const { data, error, count } = await client().from('support_ticket_events').select('id,ticket_id,action,from_status,to_status,created_at', { count: 'exact' })
    .eq('ticket_id', ticketId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + SUPPORT_THREAD_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { items: (data ?? []) as SupportEvent[], total: count ?? 0 }
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

export function createSupportTicket(tenantId: string, category: string, subject: string, description: string) {
  return rpc('create_support_ticket', { p_barangay_id: tenantId, p_category: category, p_subject: subject, p_description: description })
}
export function addSupportMessage(ticketId: string, body: string, internal = false) {
  return rpc('add_support_message', { p_ticket_id: ticketId, p_body: body, p_internal: internal })
}
export function setSupportTicketStatus(ticketId: string, status: string) {
  return rpc('set_support_ticket_status', { p_ticket_id: ticketId, p_status: status })
}
export function reopenOwnResolvedSupportTicket(ticketId: string, message: string) {
  return rpc('reopen_own_resolved_support_ticket', { p_ticket_id: ticketId, p_message: message })
}
