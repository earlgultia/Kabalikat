import { supabase } from '../../lib/supabase'

export type IncidentRow = {
  id: string; category: string; severity: string; location: string; summary: string; details: string
  status: string; resolution_note: string | null; created_by: string; managed_by: string | null; assigned_to: string | null; created_at: string
}
export type IncidentEventRow = { id: string; incident_id: string; action: string; note?: string | null; created_at: string }
export type IncidentEventPage = { rows: IncidentEventRow[]; totalCount: number }
export type IncidentEvidenceRow = { id: string; incident_id: string; file_name: string; mime_type: string; file_size: number; storage_path: string; created_at: string }
export type IncidentPage = { rows: IncidentRow[]; totalCount: number }
export type IncidentSummary = { openCount: number; urgentOpenCount: number; myOpenCount: number; assignedToMeCount: number }
export const INCIDENT_PAGE_SIZE = 20
export const INCIDENT_HISTORY_PAGE_SIZE = 50
const activeIncidentStatuses = ['submitted', 'acknowledged', 'in_progress']
const incidentEvidenceBucket = 'incident-evidence'
const allowedEvidenceTypes = new Set(['application/pdf','image/jpeg','image/png'])
const maxEvidenceBytes = 10 * 1024 * 1024

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listIncidents(input: { tenantId: string; page: number; search: string; status: string; category: string }): Promise<IncidentPage> {
  const { data, error } = await client().rpc('list_incident_reports_page', {
    p_barangay_id: input.tenantId,
    p_page: input.page,
    p_page_size: INCIDENT_PAGE_SIZE,
    p_search: input.search,
    p_status: input.status,
    p_category: input.category,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<IncidentRow & { total_count: number }>
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listIncidentSummary(tenantId: string, userId: string): Promise<IncidentSummary> {
  const countQuery = () => client().from('incidents').select('id', { count: 'exact', head: true }).eq('barangay_id', tenantId).in('status', activeIncidentStatuses)
  const results = await Promise.all([
    countQuery(),
    countQuery().in('severity', ['high', 'urgent']),
    countQuery().eq('created_by', userId),
    countQuery().eq('assigned_to', userId),
  ])
  const failed = results.find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)
  return { openCount: results[0].count ?? 0, urgentOpenCount: results[1].count ?? 0, myOpenCount: results[2].count ?? 0, assignedToMeCount: results[3].count ?? 0 }
}

export async function listIncidentEvents(tenantId: string, incidentId: string, page: number, ownStatusOnly = false): Promise<IncidentEventPage> {
  const from = page * INCIDENT_HISTORY_PAGE_SIZE
  if (ownStatusOnly) {
    const { data, error } = await client().rpc('get_own_incident_status_events_page', { p_barangay_id: tenantId, p_incident_id: incidentId, p_page: page, p_page_size: INCIDENT_HISTORY_PAGE_SIZE })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<IncidentEventRow & { total_count: number }>
    return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
  }
  const { data, error, count } = await client().from('incident_events')
    .select('id,incident_id,action,note,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId)
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: true })
    .order('id')
    .range(from, from + INCIDENT_HISTORY_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as IncidentEventRow[], totalCount: count ?? 0 }
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

export async function listIncidentEvidence(tenantId: string, incidentIds: string[]): Promise<IncidentEvidenceRow[]> {
  if (incidentIds.length === 0) return []
  const { data, error } = await client().from('incident_evidence')
    .select('id,incident_id,file_name,mime_type,file_size,storage_path,created_at')
    .eq('barangay_id', tenantId).in('incident_id', incidentIds).order('created_at', { ascending: false })
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
