import { supabase } from '../../lib/supabase'

export type IncidentRow = {
  id: string; category: string; severity: string; location: string; summary: string; details: string
  status: string; resolution_note: string | null; created_by: string; managed_by: string | null; assigned_to: string | null; created_at: string
}
export type IncidentEventRow = { id?: string; incident_id: string; action: string; note?: string | null; created_at: string }
export type IncidentAssigneeRow = { user_id: string; display_name: string }

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listIncidents(tenantId: string): Promise<IncidentRow[]> {
  const { data, error } = await client().from('incidents').select('id,category,severity,location,summary,details,status,resolution_note,created_by,managed_by,assigned_to,created_at').eq('barangay_id', tenantId).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as IncidentRow[]
}

export async function listIncidentAssignees(tenantId: string): Promise<IncidentAssigneeRow[]> {
  const { data, error } = await client().rpc('get_incident_assignees', { p_barangay_id: tenantId })
  if (error) throw new Error(error.message)
  return (data ?? []) as IncidentAssigneeRow[]
}

export async function listIncidentEvents(tenantId: string, ownStatusOnly = false): Promise<IncidentEventRow[]> {
  if (ownStatusOnly) {
    const { data, error } = await client().rpc('get_own_incident_status_events', { p_barangay_id: tenantId })
    if (error) throw new Error(error.message)
    return (data ?? []) as IncidentEventRow[]
  }
  const { data, error } = await client().from('incident_events').select('id,incident_id,action,note,created_at').eq('barangay_id', tenantId).order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as IncidentEventRow[]
}

export async function submitIncident(input: { tenantId: string; category: string; severity: string; location: string; summary: string; details: string }) {
  const { data, error } = await client().rpc('submit_incident', { p_barangay_id: input.tenantId, p_category: input.category, p_severity: input.severity, p_location: input.location, p_summary: input.summary, p_details: input.details })
  if (error) throw new Error(error.message)
  return data
}

export async function transitionIncident(incidentId: string, status: string, note = '') {
  const { error } = await client().rpc('transition_incident', { p_incident_id: incidentId, p_status: status, p_note: note })
  if (error) throw new Error(error.message)
}

export async function assignIncident(incidentId: string, tanodId: string) {
  const { error } = await client().rpc('assign_incident', { p_incident_id: incidentId, p_tanod_id: tanodId })
  if (error) throw new Error(error.message)
}

export async function addIncidentUpdate(incidentId: string, note: string) {
  const { error } = await client().rpc('add_incident_update', { p_incident_id: incidentId, p_note: note })
  if (error) throw new Error(error.message)
}
