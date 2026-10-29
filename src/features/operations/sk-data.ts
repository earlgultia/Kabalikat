import { supabase } from '../../lib/supabase'

export type SkProjectRow = {
  id: string; title: string; description: string; proposed_budget: number; planned_start: string | null; planned_end: string | null
  status: 'submitted' | 'approved' | 'rejected' | 'active' | 'completed'; created_by: string; reviewed_by: string | null
  review_note: string | null; created_at: string
}
export type SkProjectUpdateRow = {
  id: string; project_id: string; update_type: 'milestone' | 'progress'; title: string; details: string; created_at: string
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function rows<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

function rpc<T>(name: string, args: Record<string, unknown>) {
  return client().rpc(name, args).then(({ data, error }) => {
    if (error) throw new Error(error.message)
    return data as T
  })
}

export function listSkProjects(tenantId: string) {
  return rows<SkProjectRow>(client().from('sk_projects')
    .select('id,title,description,proposed_budget,planned_start,planned_end,status,created_by,reviewed_by,review_note,created_at')
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }))
}

export function listSkProjectUpdates(tenantId: string) {
  return rows<SkProjectUpdateRow>(client().from('sk_project_updates')
    .select('id,project_id,update_type,title,details,created_at').eq('barangay_id', tenantId).order('created_at', { ascending: false }))
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
