import { supabase } from '../../lib/supabase'

export type BarangayProject = { id: string; title: string; description: string; planned_start: string | null; planned_end: string | null; status: 'planned' | 'active' | 'paused' | 'completed' | 'cancelled'; created_at: string }
export type BarangayProjectUpdate = { id: string; project_id: string; update_type: 'milestone' | 'progress'; title: string; details: string; created_at: string }

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function read<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
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

export function listBarangayProjects(tenantId: string) {
  return read<BarangayProject>(client().from('barangay_projects').select('id,title,description,planned_start,planned_end,status,created_at').eq('barangay_id', tenantId).order('created_at', { ascending: false }))
}

export function listBarangayProjectUpdates(tenantId: string) {
  return read<BarangayProjectUpdate>(client().from('barangay_project_updates').select('id,project_id,update_type,title,details,created_at').eq('barangay_id', tenantId).order('created_at', { ascending: false }))
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
