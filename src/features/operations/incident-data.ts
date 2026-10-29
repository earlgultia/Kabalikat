import { supabase } from '../../lib/supabase'

export type IncidentRow = {
  id: string; category: string; severity: string; location: string; summary: string; details: string
  status: string; resolution_note: string | null; created_by: string; managed_by: string | null; assigned_to: string | null; created_at: string
}
export type IncidentEventRow = { id?: string; incident_id: string; action: string; note?: string | null; created_at: string }
export type IncidentAssigneeRow = { user_id: string; display_name: string }
export type IncidentEvidenceRow = { id: string; incident_id: string; file_name: string; mime_type: string; file_size: number; storage_path: string; created_at: string }
const incidentEvidenceBucket = 'incident-evidence'
const allowedEvidenceTypes = new Set(['application/pdf','image/jpeg','image/png'])
const maxEvidenceBytes = 10 * 1024 * 1024

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

export async function escalateIncident(incidentId: string, destination: string, note: string) {
  const { error } = await client().rpc('escalate_incident', {
    p_incident_id: incidentId, p_escalated_to: destination, p_note: note, p_handoff_confirmed: true,
  })
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

export async function listIncidentEvidence(tenantId: string): Promise<IncidentEvidenceRow[]> {
  const { data, error } = await client().from('incident_evidence')
    .select('id,incident_id,file_name,mime_type,file_size,storage_path,created_at')
    .eq('barangay_id', tenantId).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as IncidentEvidenceRow[]
}

export async function uploadIncidentEvidence(incidentId: string, file: File) {
  const fileName = file.name.replaceAll('\\', '_').replaceAll('/', '_')
    .split('').map((character) => character.charCodeAt(0) < 32 ? '_' : character).join('').trim()
  if (!fileName || fileName.length > 180) throw new Error('The file name is invalid or too long.')
  if (!allowedEvidenceTypes.has(file.type) || file.size < 1 || file.size > maxEvidenceBytes) throw new Error('Choose a PDF, JPEG, or PNG file up to 10 MB.')
  const evidenceId = window.crypto.randomUUID()
  const { data: path, error: intentError } = await client().rpc('create_incident_evidence_upload_intent', {
    p_incident_id: incidentId, p_evidence_id: evidenceId, p_file_name: fileName, p_mime_type: file.type, p_file_size: file.size,
  })
  if (intentError) throw new Error(intentError.message)
  const { error: uploadError } = await client().storage.from(incidentEvidenceBucket).upload(path, file, {
    cacheControl: '3600', contentType: file.type, upsert: false,
  })
  if (uploadError) throw new Error(uploadError.message)
  const { error: registerError } = await client().rpc('register_incident_evidence', { p_evidence_id: evidenceId })
  if (registerError) throw new Error(registerError.message)
}

export async function createIncidentEvidenceDownloadUrl(path: string) {
  const { data, error } = await client().storage.from(incidentEvidenceBucket).createSignedUrl(path, 60)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
