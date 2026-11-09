import { supabase } from '../../lib/supabase'

export type BarangayProject = { id: string; title: string; description: string; planned_start: string | null; planned_end: string | null; status: 'planned' | 'active' | 'paused' | 'completed' | 'cancelled'; created_at: string }
export type BarangayProjectUpdate = { id: string; project_id: string; update_type: 'milestone' | 'progress'; title: string; details: string; created_at: string; is_own_update: boolean }
export type BarangayProjectUpdateResponse = { id: string; author_name: string; content: string; created_at: string }
export type BarangayProjectUpdateResponsePage = { rows: BarangayProjectUpdateResponse[]; totalCount: number }
export type ProjectResponseNotificationTarget = { project_id: string; project_page: number; update_page: number; response_page: number }
export type BarangayProjectPage = { rows: BarangayProject[]; totalCount: number }
export type BarangayProjectUpdatePage = { rows: BarangayProjectUpdate[]; totalCount: number }
export type KagawadProjectContribution = {
  update_id: string; project_id: string; project_title: string; project_status: string
  update_type: 'milestone' | 'progress'; title: string; details: string; created_at: string; total_count: number
}
export const BARANGAY_PROJECT_PAGE_SIZE = 20
export const BARANGAY_PROJECT_UPDATE_PAGE_SIZE = 25

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function listBarangayProjects(tenantId: string, page: number): Promise<BarangayProjectPage> {
  const from = page * BARANGAY_PROJECT_PAGE_SIZE
  const { data, error, count } = await client().from('barangay_projects')
    .select('id,title,description,planned_start,planned_end,status,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + BARANGAY_PROJECT_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as BarangayProject[], totalCount: count ?? 0 }
}

export async function listBarangayProjectUpdates(projectId: string, page: number): Promise<BarangayProjectUpdatePage> {
  const { data, error } = await client().rpc('list_barangay_project_update_page', {
    p_project_id: projectId, p_page: page, p_page_size: BARANGAY_PROJECT_UPDATE_PAGE_SIZE,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<BarangayProjectUpdate & { total_count: number }>
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listBarangayProjectUpdateResponses(updateId: string, page: number, filters: { search: string; createdAfter: string; createdBefore: string }): Promise<BarangayProjectUpdateResponsePage> {
  const rows = await rpc<Array<BarangayProjectUpdateResponse & { total_count: number }>>('list_barangay_project_update_response_page', {
    p_update_id: updateId, p_page: page, p_page_size: 10,
    p_search: filters.search.trim() || null,
    p_created_after: filters.createdAfter || null,
    p_created_before: filters.createdBefore || null,
  })
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export function addBarangayProjectUpdateResponse(updateId: string, content: string): Promise<string> {
  return rpc<string>('add_barangay_project_update_response', { p_update_id: updateId, p_content: content })
}

export async function getProjectResponseNotificationTarget(updateId: string): Promise<ProjectResponseNotificationTarget | null> {
  const rows = await rpc<ProjectResponseNotificationTarget[]>('get_my_project_response_notification_target', { p_update_id: updateId })
  return rows[0] ?? null
}

export async function listKagawadProjectContributions(tenantId: string, page: number, filters: { search: string; updateType: string; createdAfter: string; createdBefore: string }, pageSize = 10) {
  const { data, error } = await client().rpc('search_kagawad_project_contribution_page', {
    p_barangay_id: tenantId, p_page: page, p_page_size: pageSize,
    p_search: filters.search || null,
    p_update_type: filters.updateType,
    p_created_after: filters.createdAfter || null,
    p_created_before: filters.createdBefore || null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as KagawadProjectContribution[]
  return { rows: rows.map((row) => ({ ...row, total_count: Number(row.total_count) })), totalCount: Number(rows[0]?.total_count ?? 0) }
}

export function createBarangayProject(input: { tenantId: string; title: string; description: string; start: string; end: string }) {
  return rpc<string>('create_barangay_project', { p_barangay_id: input.tenantId, p_title: input.title, p_description: input.description, p_planned_start: input.start || null, p_planned_end: input.end || null })
}

export function updateBarangayProjectStatus(projectId: string, status: BarangayProject['status']) {
  return rpc<void>('update_barangay_project_status', { p_project_id: projectId, p_status: status })
}

export function addBarangayProjectUpdate(projectId: string, type: BarangayProjectUpdate['update_type'], title: string, details: string) {
  return rpc<string>('add_barangay_project_update', { p_project_id: projectId, p_update_type: type, p_title: title, p_details: details })
}
