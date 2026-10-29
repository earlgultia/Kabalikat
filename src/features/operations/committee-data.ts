import { supabase } from '../../lib/supabase'

export type CommitteeRow = { id: string; name: string; description: string; status: 'active' | 'archived'; created_at: string }
export type CommitteeMemberRow = { committee_id: string; user_id: string; profile: { display_name: string } | null }
export type CommitteeTaskRow = {
  id: string; committee_id: string; title: string; description: string; status: 'open' | 'in_progress' | 'blocked' | 'completed'
  assigned_to: string | null; due_date: string | null; created_at: string
}
export type AssignableMemberRow = { user_id: string; display_name: string; role_label: string }

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function read<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

export function listCommittees(tenantId: string) {
  return read<CommitteeRow>(client().from('committees').select('id,name,description,status,created_at').eq('barangay_id', tenantId).order('name'))
}

export function listCommitteeMembers(tenantId: string) {
  return read<CommitteeMemberRow>(client().from('committee_members').select('committee_id,user_id,profile:profiles(display_name)').eq('barangay_id', tenantId))
}

export function listCommitteeTasks(tenantId: string) {
  return read<CommitteeTaskRow>(client().from('committee_tasks').select('id,committee_id,title,description,status,assigned_to,due_date,created_at').eq('barangay_id', tenantId).order('due_date'))
}

export async function listAssignableCommitteeMembers(tenantId: string) {
  const { data, error } = await client().rpc('get_committee_assignable_members', { p_barangay_id: tenantId })
  if (error) throw new Error(error.message)
  return (data ?? []) as AssignableMemberRow[]
}

function rpc<T>(name: string, args: Record<string, unknown>) {
  return client().rpc(name, args).then(({ data, error }) => {
    if (error) throw new Error(error.message)
    return data as T
  })
}

export function createCommittee(tenantId: string, name: string, description: string) {
  return rpc<string>('create_committee', { p_barangay_id: tenantId, p_name: name, p_description: description })
}

export function assignCommitteeMember(committeeId: string, userId: string) {
  return rpc<void>('assign_committee_member', { p_committee_id: committeeId, p_user_id: userId })
}

export function createCommitteeTask(input: { committeeId: string; title: string; description: string; assignedTo: string; dueDate: string }) {
  return rpc<string>('create_committee_task', { p_committee_id: input.committeeId, p_title: input.title, p_description: input.description,
    p_assigned_to: input.assignedTo || null, p_due_date: input.dueDate || null })
}

export function updateCommitteeTaskStatus(taskId: string, status: CommitteeTaskRow['status']) {
  return rpc<void>('update_committee_task_status', { p_task_id: taskId, p_status: status })
}
