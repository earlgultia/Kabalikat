import { supabase } from '../../lib/supabase'

export type SkProjectRow = {
  id: string; title: string; description: string; proposed_budget: number; planned_start: string | null; planned_end: string | null
  status: 'submitted' | 'approved' | 'rejected' | 'active' | 'completed'; created_by: string; reviewed_by: string | null
  review_note: string | null; created_at: string
}
export type SkProjectUpdateRow = {
  id: string; project_id: string; update_type: 'milestone' | 'progress'; title: string; details: string; created_at: string
}
export type SkAccomplishment = { id: string; project_id: string; title: string; summary: string; status: 'submitted' | 'published' | 'returned'; created_by: string | null; created_at: string; published_at: string | null; review_note: string | null }
export type SkAccomplishmentPage = { rows: SkAccomplishment[]; totalCount: number }
export type SkProjectActivity = { project_id: string; action: string; details: string; actor_name: string; created_at: string }
export type SkProjectHistoryPage<T> = { rows: T[]; totalCount: number }
export const SK_PROJECT_PAGE_SIZE = 20
export const SK_PROJECT_HISTORY_PAGE_SIZE = 25
export const SK_ACCOMPLISHMENT_PAGE_SIZE = 20

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function rpc<T>(name: string, args: Record<string, unknown>) {
  return client().rpc(name, args).then(({ data, error }) => {
    if (error) throw new Error(error.message)
    return data as T
  })
}

export async function listSkProjects(tenantId: string, page: number) {
  const from = Math.max(0, page) * SK_PROJECT_PAGE_SIZE
  const { data, count, error } = await client().from('sk_projects')
    .select('id,title,description,proposed_budget,planned_start,planned_end,status,created_by,reviewed_by,review_note,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + SK_PROJECT_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as SkProjectRow[], totalCount: count ?? 0 }
}

export async function listSkProjectUpdates(projectId: string, page: number): Promise<SkProjectHistoryPage<SkProjectUpdateRow>> {
  const { data, error } = await client().rpc('list_sk_project_update_page', {
    p_project_id: projectId, p_page: page, p_page_size: SK_PROJECT_HISTORY_PAGE_SIZE,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<SkProjectUpdateRow & { total_count: number }>
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listSkAccomplishments(tenantId: string, page: number, status: 'published' | 'review', year: number | null = null): Promise<SkAccomplishmentPage> {
  const { data, error } = await client().rpc('list_sk_accomplishment_page', {
    p_barangay_id: tenantId, p_page: page, p_page_size: SK_ACCOMPLISHMENT_PAGE_SIZE, p_status: status, p_year: status === 'published' ? year : null,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<SkAccomplishment & { total_count: number }>
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listSkAccomplishmentYears(tenantId: string): Promise<number[]> {
  const { data, error } = await client().rpc('list_sk_accomplishment_years', { p_barangay_id: tenantId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as { publication_year: number }[]).map((item) => Number(item.publication_year))
}

export async function listAllSkAccomplishments(tenantId: string, year: number | null): Promise<SkAccomplishment[]> {
  const result: SkAccomplishment[] = []
  for (let page = 0; ; page += 1) {
    const batch = await listSkAccomplishments(tenantId, page, 'published', year)
    result.push(...batch.rows)
    if (result.length >= batch.totalCount || batch.rows.length === 0) return result
  }
}

export async function listSkAccomplishmentsForProjects(tenantId: string, projectIds: string[]): Promise<SkAccomplishment[]> {
  if (!projectIds.length) return []
  const { data, error } = await client().rpc('list_sk_accomplishments_for_projects', { p_barangay_id: tenantId, p_project_ids: projectIds })
  if (error) throw new Error(error.message)
  return (data ?? []) as SkAccomplishment[]
}

export async function listSkProjectActivity(projectId: string, page: number): Promise<SkProjectHistoryPage<SkProjectActivity>> {
  const { data, error } = await client().rpc('list_sk_project_activity_page', {
    p_project_id: projectId, p_page: page, p_page_size: SK_PROJECT_HISTORY_PAGE_SIZE,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<SkProjectActivity & { total_count: number }>
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export function submitSkAccomplishment(tenantId: string, projectId: string, title: string, summary: string) {
  return rpc<string>('submit_sk_accomplishment', { p_barangay_id: tenantId, p_project_id: projectId, p_title: title, p_summary: summary })
}

export function reviewSkAccomplishment(id: string, publish: boolean, note: string | null) {
  return rpc<void>('review_sk_accomplishment', { p_accomplishment_id: id, p_publish: publish, p_note: note })
}

export function submitSkProject(input: { tenantId: string; title: string; description: string; budget: number; start: string; end: string }) {
  return rpc<string>('submit_sk_project', { p_barangay_id: input.tenantId, p_title: input.title, p_description: input.description,
    p_proposed_budget: input.budget, p_planned_start: input.start || null, p_planned_end: input.end || null })
}

export function reviewSkProject(projectId: string, approve: boolean, note: string) {
  return rpc<void>('review_sk_project', { p_project_id: projectId, p_approve: approve, p_note: note || null })
}

export function updateSkProjectStatus(projectId: string, status: 'active' | 'completed') {
  return rpc<void>('update_sk_project_status', { p_project_id: projectId, p_status: status })
}

export function addSkProjectUpdate(projectId: string, type: 'milestone' | 'progress', title: string, details: string) {
  return rpc<string>('add_sk_project_update', { p_project_id: projectId, p_update_type: type, p_title: title, p_details: details })
}
