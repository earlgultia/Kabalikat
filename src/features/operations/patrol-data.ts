import { supabase } from '../../lib/supabase'

export type PatrolShift = {
  id: string; title: string; patrol_area: string; starts_at: string; ends_at: string; status: string
  assigned_to: string; started_at: string | null; completed_at: string | null; cancellation_note: string | null; created_at: string
}
export type PatrolShiftPage = { rows: PatrolShift[]; totalCount: number }
export type PatrolLog = { id: string; shift_id: string; entry_type: string; location_note: string; details: string; created_at: string }
export type PatrolLogPage = { rows: PatrolLog[]; totalCount: number }
export type PatrolCoverageSummary = {
  total_shifts: number; scheduled_shifts: number; active_shifts: number; completed_shifts: number; cancelled_shifts: number
  checkpoint_entries: number; observation_entries: number; handover_summaries: number
}
export const PATROL_SHIFT_PAGE_SIZE = 50
export const PATROL_LOG_PAGE_SIZE = 50

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listPatrolShifts(tenantId: string, page: number, search: string, status: 'all' | 'scheduled' | 'active' | 'completed' | 'cancelled', pageSize = PATROL_SHIFT_PAGE_SIZE): Promise<PatrolShiftPage> {
  const { data, error } = await client().rpc('list_patrol_shifts_filtered_page', {
    p_barangay_id: tenantId,
    p_page: page,
    p_page_size: pageSize,
    p_search: search.trim().slice(0, 100) || null,
    p_status: status,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<PatrolShift & { total_count: number }>
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listUpcomingPatrolShifts(tenantId: string, page: number, pageSize = PATROL_SHIFT_PAGE_SIZE): Promise<PatrolShiftPage> {
  const now = new Date().toISOString()
  const from = Math.max(0, page) * pageSize
  const { data, error, count } = await client().from('patrol_shifts')
    .select('id,title,patrol_area,starts_at,ends_at,status,assigned_to,started_at,completed_at,cancellation_note,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId)
    .eq('status', 'scheduled')
    .gte('starts_at', now)
    .order('starts_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + pageSize - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as PatrolShift[], totalCount: count ?? 0 }
}

export async function getPatrolCoverageSummary(tenantId: string, from: string, to: string): Promise<PatrolCoverageSummary> {
  const { data, error } = await client().rpc('get_patrol_coverage_summary', {
    p_barangay_id: tenantId, p_from: from, p_to: to,
  })
  if (error) throw new Error(error.message)
  return ((data ?? [])[0] ?? {
    total_shifts: 0, scheduled_shifts: 0, active_shifts: 0, completed_shifts: 0, cancelled_shifts: 0,
    checkpoint_entries: 0, observation_entries: 0, handover_summaries: 0,
  }) as PatrolCoverageSummary
}

export async function findVisiblePatrolShiftPage(tenantId: string, shiftId: string): Promise<number | null> {
  const { data: target, error } = await client().from('patrol_shifts')
    .select('id,status,starts_at').eq('barangay_id', tenantId).eq('id', shiftId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!target) return null

  const statusOrder = ['active', 'scheduled', 'completed', 'cancelled']
  const targetRank = statusOrder.indexOf(target.status)
  if (targetRank < 0) return null
  const precedingStatuses = statusOrder.slice(0, targetRank)
  const precedingQuery = precedingStatuses.length
    ? client().from('patrol_shifts').select('id', { count: 'exact', head: true })
      .eq('barangay_id', tenantId).in('status', precedingStatuses)
    : null
  const [preceding, later, tied] = await Promise.all([precedingQuery,
    client().from('patrol_shifts').select('id', { count: 'exact', head: true })
      .eq('barangay_id', tenantId).eq('status', target.status).gt('starts_at', target.starts_at),
    client().from('patrol_shifts').select('id', { count: 'exact', head: true })
      .eq('barangay_id', tenantId).eq('status', target.status).eq('starts_at', target.starts_at).gt('id', target.id),
  ])
  if (preceding?.error) throw new Error(preceding.error.message)
  if (later.error) throw new Error(later.error.message)
  if (tied.error) throw new Error(tied.error.message)
  return Math.floor(((preceding?.count ?? 0) + (later.count ?? 0) + (tied.count ?? 0)) / PATROL_SHIFT_PAGE_SIZE)
}

export async function listPatrolLogs(tenantId: string, shiftId: string, page: number, filters: { entryType: string; from: string; to: string }): Promise<PatrolLogPage> {
  const { data, error } = await client().rpc('list_patrol_shift_log_page', {
    p_barangay_id: tenantId,
    p_shift_id: shiftId,
    p_page: page,
    p_page_size: PATROL_LOG_PAGE_SIZE,
    p_entry_type: filters.entryType,
    p_from: filters.from || null,
    p_to: filters.to || null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<PatrolLog & { total_count: number }>
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

async function run(name: string, args: Record<string, unknown>) {
  const { data, error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

export function createPatrolShift(input: { tenantId: string; assigneeId: string; title: string; area: string; startsAt: string; endsAt: string }) {
  return run('create_patrol_shift', { p_barangay_id: input.tenantId, p_assigned_to: input.assigneeId, p_title: input.title, p_patrol_area: input.area, p_starts_at: input.startsAt, p_ends_at: input.endsAt })
}

export function startPatrolShift(shiftId: string) { return run('start_patrol_shift', { p_shift_id: shiftId }) }
export function completePatrolShift(shiftId: string, summary: string) { return run('complete_patrol_shift', { p_shift_id: shiftId, p_summary: summary }) }
export function cancelPatrolShift(shiftId: string, reason: string) { return run('cancel_patrol_shift', { p_shift_id: shiftId, p_reason: reason }) }
export function reschedulePatrolShift(input: { shiftId: string; title: string; area: string; startsAt: string; endsAt: string; reason: string }) {
  return run('reschedule_patrol_shift', {
    p_shift_id: input.shiftId, p_title: input.title, p_patrol_area: input.area,
    p_starts_at: input.startsAt, p_ends_at: input.endsAt, p_reason: input.reason,
  })
}
export function addPatrolLog(shiftId: string, entryType: string, location: string, details: string) {
  return run('add_patrol_shift_log', { p_shift_id: shiftId, p_entry_type: entryType, p_location_note: location, p_details: details })
}
