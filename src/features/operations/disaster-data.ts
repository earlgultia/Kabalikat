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
  resource_id: string; resource_name: string; action: string; actor_name: string; note: string; created_at: string; total_count: number
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export const DISASTER_ADVISORY_PAGE_SIZE = 20
export const DISASTER_ADVISORY_HISTORY_PAGE_SIZE = 25
export const DISASTER_RESOURCE_HISTORY_PAGE_SIZE = 25
export const DISASTER_RESOURCE_PAGE_SIZE = 20

const advisoryColumns = 'id,advisory_type,severity,title,affected_area,instructions,status,expires_at,resolution_note,created_by,published_at,created_at'

export async function listDisasterAdvisoryPage(tenantId: string, page: number, search: string, severity: string, status: string) {
  const from = Math.max(0, page) * DISASTER_ADVISORY_PAGE_SIZE
  const query = search.trim().replace(/[,%()_*"\\]/g, ' ').replace(/\s+/g, ' ').slice(0, 120)
  let request = client().from('disaster_advisories').select(advisoryColumns, { count: 'exact' }).eq('barangay_id', tenantId)
  if (severity !== 'all') request = request.eq('severity', severity)
  if (status !== 'all') request = request.eq('status', status)
  if (query) request = request.or(`title.ilike.%${query}%,affected_area.ilike.%${query}%,instructions.ilike.%${query}%`)
  const { data, error, count } = await request.order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + DISASTER_ADVISORY_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { advisories: (data ?? []) as DisasterAdvisory[], total: count ?? 0 }
}

export async function findDisasterAdvisoryPage(tenantId: string, advisoryId: string) {
  const db = client()
  const { data: target, error: targetError } = await db.from('disaster_advisories').select('created_at')
    .eq('barangay_id', tenantId).eq('id', advisoryId).maybeSingle()
  if (targetError) throw new Error(targetError.message)
  if (!target) return null
  const { count, error } = await db.from('disaster_advisories').select('id', { count: 'exact', head: true })
    .eq('barangay_id', tenantId)
    .or(`created_at.gt.${target.created_at},and(created_at.eq.${target.created_at},id.gt.${advisoryId})`)
  if (error) throw new Error(error.message)
  return Math.floor((count ?? 0) / DISASTER_ADVISORY_PAGE_SIZE)
}

export const RECENT_ADVISORY_PAGE_SIZE = 50

export async function listRecentDisasterAdvisories(tenantId: string, page: number) {
  const from = Math.max(0, page) * RECENT_ADVISORY_PAGE_SIZE
  const { data, error, count } = await client().from('disaster_advisories').select(advisoryColumns, { count: 'exact' })
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + RECENT_ADVISORY_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { advisories: (data ?? []) as DisasterAdvisory[], totalCount: count ?? 0 }
}

export async function listDisasterAdvisoryEventsPage(tenantId: string, advisoryId: string, page: number) {
  const from = Math.max(0, page) * DISASTER_ADVISORY_HISTORY_PAGE_SIZE
  const { data, error, count } = await client().from('disaster_advisory_events').select('id,advisory_id,action,note,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId).eq('advisory_id', advisoryId)
    .order('created_at').order('id').range(from, from + DISASTER_ADVISORY_HISTORY_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { events: (data ?? []) as DisasterAdvisoryEvent[], total: count ?? 0 }
}

export async function listDisasterEmergencyResourcesPage(tenantId: string, page: number, search: string, resourceType: string, status: string) {
  const from = Math.max(0, page) * DISASTER_RESOURCE_PAGE_SIZE
  const term = search.trim().replace(/[,%()_*"\\]/g, ' ').replace(/\s+/g, ' ').slice(0, 100)
  let request = client().from('disaster_emergency_resources')
    .select('id,resource_type,name,phone,address,details,status,published_at,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId)
  if (resourceType !== 'all') request = request.eq('resource_type', resourceType)
  if (status !== 'all') request = request.eq('status', status)
  if (term) request = request.or(`name.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%,details.ilike.%${term}%`)
  const { data, error, count } = await request.order('resource_type').order('name').order('id')
    .range(from, from + DISASTER_RESOURCE_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { resources: (data ?? []) as DisasterEmergencyResource[], total: count ?? 0 }
}

export async function listDisasterEmergencyResourceActivity(tenantId: string, resourceId: string, page: number): Promise<DisasterEmergencyResourceActivity[]> {
  const { data, error } = await client().rpc('list_disaster_emergency_resource_activity_page', {
    p_barangay_id: tenantId, p_resource_id: resourceId, p_page: Math.max(0, page),
  })
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
