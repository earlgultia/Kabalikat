import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, FolderKanban, Plus, Waypoints } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { addBarangayProjectUpdate, BARANGAY_PROJECT_PAGE_SIZE, createBarangayProject, listBarangayProjectUpdates, listBarangayProjects, updateBarangayProjectStatus, type BarangayProject, type BarangayProjectUpdate } from './projects-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const projectSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(4000), start: z.string(), end: z.string() })
const updateSchema = z.object({ type: z.enum(['milestone', 'progress']), title: z.string().trim().min(3).max(180), details: z.string().trim().max(3000) })
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString()

const transitions: Record<BarangayProject['status'], Array<{ label: string; status: BarangayProject['status'] }>> = {
  planned: [{ label: 'Start project', status: 'active' }, { label: 'Cancel project', status: 'cancelled' }],
  active: [{ label: 'Pause project', status: 'paused' }, { label: 'Mark complete', status: 'completed' }, { label: 'Cancel project', status: 'cancelled' }],
  paused: [{ label: 'Resume project', status: 'active' }, { label: 'Cancel project', status: 'cancelled' }],
  completed: [], cancelled: [],
}

export function ProjectsPage() {
  const { membership } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'project.manage'], queryFn: () => hasPermission(tenantId, 'project.manage'), enabled: Boolean(tenantId) })
  const projects = useQuery({ queryKey: ['barangay-projects', tenantId, page], queryFn: () => listBarangayProjects(tenantId, page), enabled: Boolean(tenantId) })
  const projectIds = projects.data?.rows.map((project) => project.id) ?? []
  const updates = useQuery({ queryKey: ['barangay-project-updates', tenantId, projectIds], queryFn: () => listBarangayProjectUpdates(tenantId, projectIds), enabled: Boolean(tenantId) && Boolean(projects.data) })
  const projectUpdatesById = new Map<string, BarangayProjectUpdate[]>()
  updates.data?.forEach((update) => {
    const projectUpdates = projectUpdatesById.get(update.project_id)
    if (projectUpdates) projectUpdates.push(update)
    else projectUpdatesById.set(update.project_id, [update])
  })
  const totalPages = Math.ceil((projects.data?.totalCount ?? 0) / BARANGAY_PROJECT_PAGE_SIZE)
  const [showForm, setShowForm] = useState(false)
  const [updateProject, setUpdateProject] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['barangay-projects', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['barangay-project-updates', tenantId] }),
    ])
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = projectSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the project details.'); return }
    if (parsed.data.start && parsed.data.end && parsed.data.end < parsed.data.start) { setError('The planned end date must be after the start date.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await createBarangayProject({ tenantId, title: parsed.data.title, description: parsed.data.description, start: parsed.data.start, end: parsed.data.end })
      setPage(0); await refresh(); form.reset(); setShowForm(false); setMessage('Barangay project added.')
    } catch { setError('Unable to create the project. Review the details and try again.') }
    finally { setBusy(false) }
  }

  async function changeStatus(project: BarangayProject, status: BarangayProject['status']) {
    const action = transitions[project.status].find((item) => item.status === status)
    if (!action || !window.confirm(`${action.label}: “${project.title}”?`)) return
    setBusy(true); setError(''); setMessage('')
    try { await updateBarangayProjectStatus(project.id, status); await refresh(); setMessage(`${project.title} is now ${status.replaceAll('_', ' ')}.`) }
    catch { setError('Unable to update this project. Refresh and try again.') }
    finally { setBusy(false) }
  }

  async function addUpdate(projectId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = updateSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the progress update.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await addBarangayProjectUpdate(projectId, parsed.data.type, parsed.data.title, parsed.data.details); await refresh(); form.reset(); setUpdateProject(''); setMessage('Project progress recorded.') }
    catch { setError('Unable to save this update. Refresh and try again.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Barangay projects" description="Track community projects, planned dates, status, and progress updates.">
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}><Plus size={15} />New project</button>}
    </PageHeading>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view project status and progress." />}
    {Boolean(tenantId) && canManage.isPending && <LoadingNotice compact />}
    {canManage.error && <ErrorNotice message="Project management access could not be checked. Project records remain available under your current access; management controls are unavailable until permissions can be verified." />}
    {message && <div className="ops-success" role="status"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canManage.data && !canManage.isPending && !canManage.error && <div className="ops-panel archive-access"><FolderKanban size={20} /><div><strong>Read-only project access</strong><p>Active barangay members can view project status. Creating projects and recording updates is limited to authorized officials.</p></div></div>}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void createProject(event)}><div className="ops-panel-heading"><div><h2>New barangay project</h2><p>Project notes are separate from the official finance ledger.</p></div><FolderKanban size={19} /></div><div className="ops-form-grid"><label>Project title<input name="title" minLength={3} maxLength={180} required /></label><label>Planned start<input name="start" type="date" /></label><label>Planned end<input name="end" type="date" /></label><label className="span-two">Description<textarea name="description" maxLength={4000} /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Create project</button></div></form>}
    {(projects.isPending || updates.isPending) && tenantId && <LoadingNotice />}
    {(projects.error || updates.error) && <ErrorNotice message="Unable to load project records." />}
    {projects.data?.totalCount === 0 && <div className="ops-empty"><FolderKanban size={22} /><strong>No barangay projects yet</strong><p>When an authorized official adds a project, its status and progress will appear here.</p></div>}
    <div className="barangay-project-list">{projects.data?.rows.map((project) => {
      const projectUpdates = projectUpdatesById.get(project.id) ?? []
      return <article className="ops-panel barangay-project-card" key={project.id}>
        <div className="barangay-project-header"><div><StatusPill status={project.status} /><h2>{project.title}</h2><p>{project.description || 'No description provided.'}</p></div><Waypoints size={21} aria-hidden="true" /></div>
        {(project.planned_start || project.planned_end) && <div className="sk-project-meta">{project.planned_start && <span>Start {dateLabel(project.planned_start)}</span>}{project.planned_end && <span>End {dateLabel(project.planned_end)}</span>}<span>Created {formatDateTime(project.created_at)}</span></div>}
        {canManage.data && <div className="finance-review-actions">{transitions[project.status].map((action) => <button key={action.status} className={action.status === 'cancelled' ? 'button outline danger-action' : 'button outline'} disabled={busy} onClick={() => void changeStatus(project, action.status)}>{action.label}</button>)}</div>}
        <section className="sk-project-updates"><h3>Milestones & progress <span>{projectUpdates.length}</span></h3>{projectUpdates.length ? <ul>{projectUpdates.map((update: BarangayProjectUpdate) => <li key={update.id}><StatusPill status={update.update_type} /><div><strong>{update.title}</strong>{update.details && <p>{update.details}</p>}<small>{formatDateTime(update.created_at)}</small></div></li>)}</ul> : <p>No progress updates yet.</p>}
          {canManage.data && ['active', 'paused'].includes(project.status) && <>{updateProject === project.id ? <form className="sk-update-form" onSubmit={(event) => void addUpdate(project.id, event)}><label>Update type<select name="type"><option value="progress">Progress report</option><option value="milestone">Milestone</option></select></label><label>Title<input name="title" minLength={3} maxLength={180} required /></label><label>Details<textarea name="details" maxLength={3000} /></label><div className="finance-review-actions"><button type="button" className="button outline" onClick={() => setUpdateProject('')}>Cancel</button><button className="button primary" disabled={busy}>Save update</button></div></form> : <button className="button outline" disabled={busy} onClick={() => setUpdateProject(project.id)}>Add milestone or progress update</button>}</>}
        </section>
      </article>
    })}</div>
    {totalPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="Project pages">
      <span className="muted">Page {page + 1} of {totalPages} - {projects.data?.totalCount ?? 0} projects</span>
      <div className="finance-review-actions">
        <button className="button outline" disabled={page === 0 || projects.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button>
        <button className="button outline" disabled={page + 1 >= totalPages || projects.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button>
      </div>
    </nav>}
  </section>
}
