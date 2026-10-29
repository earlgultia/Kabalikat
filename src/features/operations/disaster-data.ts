import { supabase } from '../../lib/supabase'

export type DisasterAdvisory = {
  id: string; advisory_type: string; severity: string; title: string; affected_area: string; instructions: string
  status: string; expires_at: string | null; resolution_note: string | null; created_by: string; published_at: string | null; created_at: string
}
export type DisasterAdvisoryEvent = { id: string; advisory_id: string; action: string; note: string; created_at: string }
export type DisasterEmergencyResource = {
  id: string; resource_type: 'emergency_contact' | 'evacuation_center'; name: string; phone: string | null
  address: string | null; details: string; status: 'draft' | 'published' | 'archived'; published_at: string | null; created_at: string
}
export type DisasterEmergencyResourceActivity = {
  resource_id: string; resource_name: string; action: string; actor_name: string; note: string; created_at: string
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listDisasterAdvisories(tenantId: string): Promise<DisasterAdvisory[]> {
  const { data, error } = await client().from('disaster_advisories').select('id,advisory_type,severity,title,affected_area,instructions,status,expires_at,resolution_note,created_by,published_at,created_at').eq('barangay_id', tenantId).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as DisasterAdvisory[]
}

export async function listDisasterAdvisoryEvents(tenantId: string): Promise<DisasterAdvisoryEvent[]> {
  const { data, error } = await client().from('disaster_advisory_events').select('id,advisory_id,action,note,created_at').eq('barangay_id', tenantId).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as DisasterAdvisoryEvent[]
}

export async function listDisasterEmergencyResources(tenantId: string): Promise<DisasterEmergencyResource[]> {
  const { data, error } = await client().from('disaster_emergency_resources')
    .select('id,resource_type,name,phone,address,details,status,published_at,created_at')
    .eq('barangay_id', tenantId).order('resource_type').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as DisasterEmergencyResource[]
}

export async function listDisasterEmergencyResourceActivity(tenantId: string): Promise<DisasterEmergencyResourceActivity[]> {
  const { data, error } = await client().rpc('list_disaster_emergency_resource_activity', { p_barangay_id: tenantId })
  if (error) throw new Error(error.message)
  return (data ?? []) as DisasterEmergencyResourceActivity[]
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

export function createDisasterAdvisory(input: { tenantId: string; type: string; severity: string; title: string; area: string; instructions: string; expiresAt: string | null }) {
  return rpc('create_disaster_advisory', { p_barangay_id: input.tenantId, p_type: input.type, p_severity: input.severity, p_title: input.title, p_affected_area: input.area, p_instructions: input.instructions, p_expires_at: input.expiresAt })
}
export function publishDisasterAdvisory(id: string) { return rpc('publish_disaster_advisory', { p_advisory_id: id }) }
export function resolveDisasterAdvisory(id: string, note: string) { return rpc('resolve_disaster_advisory', { p_advisory_id: id, p_note: note }) }
export function saveDisasterEmergencyResource(input: {
  tenantId: string; resourceId: string | null; resourceType: 'emergency_contact' | 'evacuation_center'
  name: string; phone: string; address: string; details: string
}) {
  return rpc('save_disaster_emergency_resource', {
    p_barangay_id: input.tenantId, p_resource_id: input.resourceId, p_resource_type: input.resourceType,
    p_name: input.name, p_phone: input.phone || null, p_address: input.address || null, p_details: input.details,
  })
}
export function publishDisasterEmergencyResource(id: string) {
  return rpc('publish_disaster_emergency_resource', { p_resource_id: id })
}
export function archiveDisasterEmergencyResource(id: string, note: string) {
  return rpc('archive_disaster_emergency_resource', { p_resource_id: id, p_note: note })
}
