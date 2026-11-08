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
export type KagawadAssignedActionItem = CommitteeTaskRow & { committee_name: string; total_count: number }
export type KagawadAssignedActionItemPage = { rows: KagawadAssignedActionItem[]; totalCount: number }
export type KagawadTaskAssignmentEvent = {
  id: string; task_id: string; committee_name: string; task_title: string
  task_status: CommitteeTaskRow['status']; due_date: string | null; assigned_at: string
  assigned_by_name: string | null; previous_assignee_name: string | null; total_count: number
}
export type KagawadTaskAssignmentHistoryPage = { rows: KagawadTaskAssignmentEvent[]; totalCount: number }
export type KagawadCompletedWork = { id: string; task_id: string; task_title: string; committee_name: string; summary: string; completed_at: string; total_count: number }
export type KagawadCompletedWorkPage = { rows: KagawadCompletedWork[]; totalCount: number }
export type KagawadActionItemNote = { id: string; note: string; author_name: string; created_at: string }
export type CommitteeTaskNotificationContext = {
  id: string; committee_id: string; committee_name: string; title: string; description: string
  status: CommitteeTaskRow['status']; due_date: string | null; can_add_note: boolean; can_respond: boolean
}
export type KagawadTaskStatusEvent = { id: string; actor_name: string; details: string; created_at: string; total_count: number }
export type KagawadTaskStatusHistoryPage = { rows: KagawadTaskStatusEvent[]; totalCount: number }
export type KagawadTaskDueDateRequest = {
  id: string; current_due_date: string | null; proposed_due_date: string; reason: string
  status: 'pending' | 'approved' | 'declined' | 'withdrawn'; decision_note: string; created_at: string; reviewed_at: string | null; total_count: number
}
export type KagawadTaskDueDateRequestPage = { rows: KagawadTaskDueDateRequest[]; totalCount: number }
export type CommitteeTaskDueDateReview = {
  id: string; task_id: string; task_title: string; committee_name: string
  current_due_date: string | null; proposed_due_date: string; reason: string
  requester_name: string; created_at: string; total_count: number
}
export type CommitteeTaskDueDateReviewPage = { rows: CommitteeTaskDueDateReview[]; totalCount: number }
export type CommitteeTaskDueDateReviewHistory = CommitteeTaskDueDateReview & {
  status: 'approved' | 'declined' | 'withdrawn'; decision_note: string; reviewer_name: string
  reviewed_at: string; total_count: number
}
export type CommitteeTaskDueDateReviewHistoryPage = { rows: CommitteeTaskDueDateReviewHistory[]; totalCount: number }
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

export async function listKagawadAssignedActionItems(tenantId: string, page: number, status: 'all' | CommitteeTaskRow['status'], search: string, dueFilter: 'all' | 'due_soon' | 'overdue'): Promise<KagawadAssignedActionItemPage> {
  const { data, error } = await client().rpc('list_kagawad_assigned_action_items', {
    p_barangay_id: tenantId, p_page: page, p_page_size: 10, p_status: status, p_search: search.trim() || null, p_due_filter: dueFilter,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as KagawadAssignedActionItem[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function getKagawadAgendaTasks(tenantId: string): Promise<KagawadAssignedActionItem[]> {
  const pages = await Promise.all((['open', 'in_progress', 'blocked'] as const).map((status) =>
    listKagawadAssignedActionItems(tenantId, 0, status, '', 'all'),
  ))
  return pages.flatMap((page) => page.rows)
    .sort((left, right) => {
      if (!left.due_date && !right.due_date) return left.created_at.localeCompare(right.created_at)
      if (!left.due_date) return 1
      if (!right.due_date) return -1
      return left.due_date.localeCompare(right.due_date)
    })
    .slice(0, 4)
}

export async function listKagawadTaskAssignmentHistory(tenantId: string, page: number, filters: { search: string; status: string; assignedAfter: string; assignedBefore: string }): Promise<KagawadTaskAssignmentHistoryPage> {
  const { data, error } = await client().rpc('search_kagawad_task_assignment_history', {
    p_barangay_id: tenantId, p_page: page, p_page_size: 10,
    p_search: filters.search.trim() || null, p_status: filters.status,
    p_assigned_after: filters.assignedAfter || null, p_assigned_before: filters.assignedBefore || null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as KagawadTaskAssignmentEvent[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listKagawadCompletedWork(tenantId: string, page: number, filters: { search: string; completedAfter: string; completedBefore: string }): Promise<KagawadCompletedWorkPage> {
  const { data, error } = await client().rpc('search_kagawad_completed_work_history', {
    p_barangay_id: tenantId, p_page: page, p_page_size: 10,
    p_search: filters.search.trim() || null,
    p_completed_after: filters.completedAfter || null,
    p_completed_before: filters.completedBefore || null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as KagawadCompletedWork[]
  return { rows: rows.map((row) => ({ ...row, total_count: Number(row.total_count) })), totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listKagawadActionItemNotes(taskId: string): Promise<KagawadActionItemNote[]> {
  const { data, error } = await client().rpc('list_kagawad_action_item_notes', { p_task_id: taskId })
  if (error) throw new Error(error.message)
  return (data ?? []) as KagawadActionItemNote[]
}

export async function getCommitteeTaskNotificationContext(taskId: string): Promise<CommitteeTaskNotificationContext | null> {
  const { data, error } = await client().rpc('get_committee_task_notification_context', { p_task_id: taskId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as CommitteeTaskNotificationContext[])[0] ?? null
}

export async function listKagawadTaskStatusHistory(taskId: string, page: number): Promise<KagawadTaskStatusHistoryPage> {
  const { data, error } = await client().rpc('list_kagawad_task_status_history', {
    p_task_id: taskId, p_page: page, p_page_size: 10,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as KagawadTaskStatusEvent[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function addKagawadActionItemNote(taskId: string, note: string): Promise<void> {
  const { error } = await client().rpc('add_kagawad_action_item_note', { p_task_id: taskId, p_note: note.trim() })
  if (error) throw new Error(error.message)
}

export async function addCommitteeTaskProgressNote(taskId: string, note: string): Promise<void> {
  const { error } = await client().rpc('add_committee_task_progress_note', { p_task_id: taskId, p_note: note.trim() })
  if (error) throw new Error(error.message)
}

export async function reportKagawadTaskBlocker(taskId: string, reason: string): Promise<void> {
  const { error } = await client().rpc('report_kagawad_task_blocker', {
    p_task_id: taskId, p_reason: reason.trim(),
  })
  if (error) throw new Error(error.message)
}

export async function completeKagawadTask(taskId: string, summary: string): Promise<void> {
  const { error } = await client().rpc('complete_kagawad_task', {
    p_task_id: taskId, p_summary: summary.trim(),
  })
  if (error) throw new Error(error.message)
}

export async function listKagawadTaskDueDateRequestHistory(taskId: string, page: number): Promise<KagawadTaskDueDateRequestPage> {
  const { data, error } = await client().rpc('list_kagawad_task_due_date_request_history', {
    p_task_id: taskId, p_page: page, p_page_size: 5,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as KagawadTaskDueDateRequest[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function requestCommitteeTaskDueDate(taskId: string, proposedDate: string, reason: string): Promise<void> {
  const { error } = await client().rpc('request_committee_task_due_date', {
    p_task_id: taskId, p_proposed_due_date: proposedDate, p_reason: reason.trim(),
  })
  if (error) throw new Error(error.message)
}

export async function withdrawCommitteeTaskDueDateRequest(requestId: string): Promise<void> {
  const { error } = await client().rpc('withdraw_committee_task_due_date_request', { p_request_id: requestId })
  if (error) throw new Error(error.message)
}

export async function listCommitteeTaskDueDateRequests(tenantId: string, page: number, filters: { search: string; createdAfter: string; createdBefore: string }): Promise<CommitteeTaskDueDateReviewPage> {
  const { data, error } = await client().rpc('list_committee_task_due_date_requests', {
    p_barangay_id: tenantId, p_page: page, p_page_size: 20,
    p_search: filters.search.trim() || null,
    p_created_after: filters.createdAfter || null,
    p_created_before: filters.createdBefore || null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as CommitteeTaskDueDateReview[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listCommitteeTaskDueDateRequestHistory(tenantId: string, page: number, filters: { status: string; search: string; createdAfter: string; createdBefore: string }): Promise<CommitteeTaskDueDateReviewHistoryPage> {
  const { data, error } = await client().rpc('list_committee_task_due_date_request_history', {
    p_barangay_id: tenantId, p_page: page, p_page_size: 20,
    p_status: filters.status,
    p_search: filters.search.trim() || null,
    p_created_after: filters.createdAfter || null,
    p_created_before: filters.createdBefore || null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as CommitteeTaskDueDateReviewHistory[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function decideCommitteeTaskDueDateRequest(requestId: string, decision: 'approved' | 'declined', note: string): Promise<void> {
  const { error } = await client().rpc('decide_committee_task_due_date_request', {
    p_request_id: requestId, p_decision: decision, p_decision_note: note.trim(),
  })
  if (error) throw new Error(error.message)
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

export async function listActiveCommitteeMembers(tenantId: string, committeeId: string, page: number, search: string): Promise<AssignableMemberPage> {
  const { data, error } = await client().rpc('list_committee_active_member_page', {
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

export function reassignCommitteeTask(taskId: string, userId: string) {
  return rpc<void>('reassign_committee_task', { p_task_id: taskId, p_assigned_to: userId })
}
