import { supabase } from '../../lib/supabase'

export type CommitteeRow = { id: string; name: string; description: string; status: 'active' | 'archived'; created_at: string }
export type CommitteeMemberRow = { committee_id: string; user_id: string; profile: { display_name: string } | null }
export type CommitteeMemberPage = { rows: CommitteeMemberRow[]; totalCount: number }
export type CommitteeTaskRow = {
  id: string; committee_id: string; title: string; description: string; status: 'open' | 'in_progress' | 'blocked' | 'completed'
  assigned_to: string | null; due_date: string | null; created_at: string
  assignee_name?: string | null
}
export type CommitteeTaskPage = { rows: CommitteeTaskRow[]; totalCount: number }
export type AssignableMemberRow = { user_id: string; display_name: string; role_label: string }
export type AssignableMemberPage = { rows: AssignableMemberRow[]; totalCount: number }
export type CommitteePage = { rows: CommitteeRow[]; totalCount: number }
export const COMMITTEE_PAGE_SIZE = 20
export const COMMITTEE_MEMBER_PAGE_SIZE = 25
export const COMMITTEE_CONTENT_PAGE_SIZE = 25

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function read<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

export async function listCommittees(tenantId: string, page: number): Promise<CommitteePage> {
  const from = page * COMMITTEE_PAGE_SIZE
  const { data, error, count } = await client().from('committees')
    .select('id,name,description,status,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId)
    .order('name')
    .order('id')
    .range(from, from + COMMITTEE_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as CommitteeRow[], totalCount: count ?? 0 }
}

export async function listCommitteeMembers(tenantId: string, committeeId: string, page: number): Promise<CommitteeMemberPage> {
  const from = Math.max(page, 0) * COMMITTEE_CONTENT_PAGE_SIZE
  const { data, error, count } = await client().from('committee_members')
    .select('committee_id,user_id,profile:profiles(display_name)', { count: 'exact' })
    .eq('barangay_id', tenantId).eq('committee_id', committeeId)
    .order('user_id').range(from, from + COMMITTEE_CONTENT_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as unknown as CommitteeMemberRow[], totalCount: count ?? 0 }
}

export async function listCommitteeTasks(tenantId: string, committeeId: string, page: number): Promise<CommitteeTaskPage> {
  const from = Math.max(page, 0) * COMMITTEE_CONTENT_PAGE_SIZE
  const { data, error, count } = await client().from('committee_tasks')
    .select('id,committee_id,title,description,status,assigned_to,due_date,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId).eq('committee_id', committeeId)
    .order('due_date', { ascending: true, nullsFirst: false }).order('id')
    .range(from, from + COMMITTEE_CONTENT_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as CommitteeTaskRow[]
  const assigneeIds = [...new Set(rows.map((task) => task.assigned_to).filter((id): id is string => Boolean(id)))]
  if (assigneeIds.length) {
    const names = await read<{ id: string; display_name: string | null }>(client().from('profiles').select('id,display_name').in('id', assigneeIds))
    const nameById = new Map(names.map((profile) => [profile.id, profile.display_name]))
    for (const task of rows) task.assignee_name = task.assigned_to ? nameById.get(task.assigned_to) : null
  }
  return { rows, totalCount: count ?? 0 }
}

export async function listAssignableCommitteeMembers(tenantId: string, committeeId: string, page: number, search: string): Promise<AssignableMemberPage> {
  const { data, error } = await client().rpc('list_committee_assignable_member_page', {
    p_barangay_id: tenantId, p_committee_id: committeeId, p_page: page,
    p_page_size: COMMITTEE_MEMBER_PAGE_SIZE, p_search: search.trim() || null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as (AssignableMemberRow & { total_count: number })[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
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
