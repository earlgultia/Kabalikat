import { supabase } from '../../lib/supabase'

export type PatrolAssignee = { user_id: string; display_name: string }
export type PatrolShift = {
  id: string; title: string; patrol_area: string; starts_at: string; ends_at: string; status: string
  assigned_to: string; started_at: string | null; completed_at: string | null; cancellation_note: string | null; created_at: string
}
export type PatrolLog = { id: string; shift_id: string; entry_type: string; location_note: string; details: string; created_at: string }

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listPatrolAssignees(tenantId: string): Promise<PatrolAssignee[]> {
  const { data, error } = await client().rpc('get_patrol_assignees', { p_barangay_id: tenantId })
  if (error) throw new Error(error.message)
  return (data ?? []) as PatrolAssignee[]
}

export async function listPatrolShifts(tenantId: string): Promise<PatrolShift[]> {
  const { data, error } = await client().from('patrol_shifts').select('id,title,patrol_area,starts_at,ends_at,status,assigned_to,started_at,completed_at,cancellation_note,created_at').eq('barangay_id', tenantId).order('starts_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as PatrolShift[]
}

export async function listPatrolLogs(tenantId: string): Promise<PatrolLog[]> {
  const { data, error } = await client().from('patrol_shift_logs').select('id,shift_id,entry_type,location_note,details,created_at').eq('barangay_id', tenantId).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as PatrolLog[]
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
