import { supabase } from '../../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export type LguBarangay = {
  id: string; name: string; municipality: string; province: string; code: string
  status: string; active_members: number; captain_active: boolean
  pending_captain_email: string | null; pending_captain_invite_expires_at: string | null; created_at: string
}
export type LguBarangayDirectoryPage = { rows: LguBarangay[]; total_count: number }

export type LguIncidentEscalation = {
  id: string; incident_id: string; barangay_id: string; barangay_name: string
  category: string; severity: string; location: string; summary: string; details: string
  incident_status: string; escalation_note: string; status: 'pending' | 'acknowledged' | 'resolved'
  lgu_response_note: string | null; created_at: string; updated_at: string; total_count: number
}

export type LguIncidentEscalationEvent = {
  id: string; action: 'escalated' | 'acknowledged' | 'resolved'; note: string
  actor_name: string; created_at: string
}
export type LguIncidentEscalationPage = { rows: LguIncidentEscalation[]; total_count: number }
export type LguIncidentResponseWorkload = { pending_escalations: number; acknowledged_escalations: number; high_priority_pending: number; oldest_pending_at: string | null }
export const LGU_INCIDENT_ESCALATION_PAGE_SIZE = 25

export type LguMunicipalIncidentReport = {
  id: string; barangay_id: string; barangay_name: string; category: string; severity: string
  location: string; summary: string; details: string; status: string; created_at: string; updated_at: string
  escalation_status: 'pending' | 'acknowledged' | 'resolved' | null
  escalation_note: string | null; lgu_response_note: string | null
}
export type LguMunicipalIncidentReportPage = { rows: LguMunicipalIncidentReport[]; total_count: number }
export type LguMunicipalIncidentSummary = {
  open_reports: number; urgent_open_reports: number; reported_today: number; pending_escalations: number
}
export type LguPriorityIncidentNeedingFollowUp = Pick<LguMunicipalIncidentReport,
  'id' | 'barangay_id' | 'barangay_name' | 'category' | 'severity' | 'location' | 'summary' | 'details' | 'status' | 'created_at'>
export type LguPriorityIncidentFollowUpPage = { rows: LguPriorityIncidentNeedingFollowUp[]; total_count: number }
export const LGU_MUNICIPAL_REPORT_PAGE_SIZE = 25
export const LGU_BARANGAY_DIRECTORY_PAGE_SIZE = 25

export async function createLguBarangay(input: { name: string; code: string; captainEmail: string }) {
  const { data, error } = await client().rpc('create_lgu_barangay_with_captain', {
    p_name: input.name.trim(), p_code: input.code.trim(), p_captain_email: input.captainEmail.trim(),
  })
  if (error) throw new Error(error.message)
  const row = (data ?? [])[0] as { created_barangay_id: string; invitation_token: string; expires_at: string } | undefined
  if (!row?.invitation_token) throw new Error('Barangay onboarding did not return a Captain invitation.')
  return row
}

export async function createLguCaptainInvitation(barangayId: string, captainEmail: string) {
  const { data, error } = await client().rpc('create_lgu_captain_invitation', {
    p_barangay_id: barangayId, p_captain_email: captainEmail.trim(),
  })
  if (error) throw new Error(error.message)
  const row = (data ?? [])[0] as { invitation_token: string; expires_at: string } | undefined
  if (!row?.invitation_token) throw new Error('The Captain invitation was not created.')
  return row
}

export async function listLguBarangays(page: number, search: string, needsCaptain: boolean) {
  const { data, error } = await client().rpc('list_lgu_barangay_directory_page', {
    p_page: Math.max(0,page), p_page_size: LGU_BARANGAY_DIRECTORY_PAGE_SIZE,
    p_search: search.trim() || null, p_needs_captain: needsCaptain,
  })
  if (error) throw new Error(error.message)
  return data as LguBarangayDirectoryPage
}

export async function listLguIncidentEscalations(status: string, page: number, search: string, severity: string, createdAfter: string, createdBefore: string) {
  const { data, error } = await client().rpc('list_lgu_incident_escalations_page', {
    p_status: status, p_page: Math.max(0, page), p_page_size: LGU_INCIDENT_ESCALATION_PAGE_SIZE,
    p_search: search.trim() || null, p_severity: severity,
    p_created_after: createdAfter || null, p_created_before: createdBefore || null,
  })
  if (error) throw new Error(error.message)
  return data as LguIncidentEscalationPage
}

export async function getLguIncidentResponseWorkload() {
  const { data, error } = await client().rpc('get_lgu_incident_response_workload')
  if (error) throw new Error(error.message)
  const row = (data ?? [])[0] as LguIncidentResponseWorkload | undefined
  return {
    pending_escalations: Number(row?.pending_escalations ?? 0),
    acknowledged_escalations: Number(row?.acknowledged_escalations ?? 0),
    high_priority_pending: Number(row?.high_priority_pending ?? 0),
    oldest_pending_at: row?.oldest_pending_at ?? null,
  } satisfies LguIncidentResponseWorkload
}

export async function listLguMunicipalIncidentReports(input: { page: number; search: string; status: string; severity: string; createdAfter: string; createdBefore: string }) {
  const { data, error } = await client().rpc('list_lgu_municipal_incident_reports', {
    p_page: Math.max(0, input.page), p_page_size: LGU_MUNICIPAL_REPORT_PAGE_SIZE,
    p_search: input.search.trim() || null, p_status: input.status, p_severity: input.severity,
    p_created_after: input.createdAfter || null, p_created_before: input.createdBefore || null,
  })
  if (error) throw new Error(error.message)
  return data as LguMunicipalIncidentReportPage
}

export async function getLguMunicipalIncidentSummary() {
  const { data, error } = await client().rpc('get_lgu_municipal_incident_summary')
  if (error) throw new Error(error.message)
  return (data?.[0] ?? { open_reports: 0, urgent_open_reports: 0, reported_today: 0, pending_escalations: 0 }) as LguMunicipalIncidentSummary
}

export async function listLguPriorityIncidentsNeedingBarangayFollowUp() {
  const { data, error } = await client().rpc('list_lgu_priority_incidents_needing_barangay_follow_up', { p_limit: 10 })
  if (error) throw new Error(error.message)
  return { rows: data?.rows ?? [], total_count: Number(data?.total_count ?? 0) } as LguPriorityIncidentFollowUpPage
}

export async function listLguIncidentEscalationHistory(escalationId: string) {
  const { data, error } = await client().rpc('list_lgu_incident_escalation_history', { p_escalation_id: escalationId })
  if (error) throw new Error(error.message)
  return (data ?? []) as LguIncidentEscalationEvent[]
}

export async function updateLguIncidentEscalation(id: string, status: 'acknowledged' | 'resolved', note: string) {
  const { error } = await client().rpc('update_lgu_incident_escalation', {
    p_escalation_id: id, p_status: status, p_note: note.trim(),
  })
  if (error) throw new Error(error.message)
}
