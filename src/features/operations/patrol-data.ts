import { supabase } from '../../lib/supabase'

export type PatrolShift = {
  id: string; title: string; patrol_area: string; starts_at: string; ends_at: string; status: string
  assigned_to: string; started_at: string | null; completed_at: string | null; cancellation_note: string | null; created_at: string
}
export type PatrolShiftPage = { rows: PatrolShift[]; totalCount: number }
export type PatrolLog = { id: string; shift_id: string; entry_type: string; location_note: string; details: string; created_at: string }
export type PatrolLogPage = { rows: PatrolLog[]; totalCount: number }
export const PATROL_SHIFT_PAGE_SIZE = 50
export const PATROL_LOG_PAGE_SIZE = 50

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listPatrolShifts(tenantId: string, page: number, search: string, status: 'all' | 'scheduled' | 'active' | 'completed' | 'cancelled'): Promise<PatrolShiftPage> {
  const { data, error } = await client().rpc('list_patrol_shifts_filtered_page', {
    p_barangay_id: tenantId,
    p_page: page,
    p_page_size: PATROL_SHIFT_PAGE_SIZE,
    p_search: search.trim().slice(0, 100) || null,
    p_status: status,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<PatrolShift & { total_count: number }>
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listPatrolLogs(tenantId: string, shiftId: string, page: number): Promise<PatrolLogPage> {
  const from = page * PATROL_LOG_PAGE_SIZE
  const { data, error, count } = await client().from('patrol_shift_logs')
    .select('id,shift_id,entry_type,location_note,details,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId)
    .eq('shift_id', shiftId)
    .order('created_at')
    .order('id')
    .range(from, from + PATROL_LOG_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as PatrolLog[], totalCount: count ?? 0 }
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
export function completePatrolShift(shiftId: string) { return run('complete_patrol_shift', { p_shift_id: shiftId }) }
export function cancelPatrolShift(shiftId: string, reason: string) { return run('cancel_patrol_shift', { p_shift_id: shiftId, p_reason: reason }) }
export function addPatrolLog(shiftId: string, entryType: string, location: string, details: string) {
  return run('add_patrol_shift_log', { p_shift_id: shiftId, p_entry_type: entryType, p_location_note: location, p_details: details })
}
