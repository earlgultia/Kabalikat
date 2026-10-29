import { supabase } from '../../lib/supabase'

export type SupportTicket = { id: string; barangay_id: string; requester_id: string; category: string; subject: string; description: string; status: string; created_at: string; updated_at: string }
export type SupportMessage = { id: string; ticket_id: string; author_id: string; visibility: string; body: string; created_at: string }
export type SupportEvent = { id: string; ticket_id: string; action: string; from_status: string | null; to_status: string | null; created_at: string }

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listSupportTickets(tenantId?: string, page = 0, status = 'all', search = ''): Promise<SupportTicket[]> {
  let query = client().from('support_tickets').select('id,barangay_id,requester_id,category,subject,description,status,created_at,updated_at').order('updated_at', { ascending: false })
  if (tenantId) query = query.eq('barangay_id', tenantId)
  if (status !== 'all') query = query.eq('status', status)
  const term = search.trim()
  if (term) query = query.ilike('subject', `%${term.replace(/[\\%_]/g, '\\$&')}%`)
  const { data, error } = await query.range(page * 50, (page + 1) * 50 - 1)
  if (error) throw new Error(error.message)
  return (data ?? []) as SupportTicket[]
}

export async function listSupportMessages(ticketIds: string[]): Promise<SupportMessage[]> {
  if (!ticketIds.length) return []
  const { data, error } = await client().from('support_messages').select('id,ticket_id,author_id,visibility,body,created_at').in('ticket_id', ticketIds).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as SupportMessage[]
}

export async function listSupportEvents(ticketIds: string[]): Promise<SupportEvent[]> {
  if (!ticketIds.length) return []
  const { data, error } = await client().from('support_ticket_events').select('id,ticket_id,action,from_status,to_status,created_at').in('ticket_id', ticketIds).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as SupportEvent[]
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
