import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, FileCheck2, FolderKanban } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { addSkProjectUpdate, listSkProjectUpdates, listSkProjects, reviewSkProject, submitSkProject, updateSkProjectStatus } from './sk-data'
import { ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const projectSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().min(3).max(4000), budget: z.coerce.number().min(0).max(999999999999.99), start: z.string(), end: z.string() })
const updateSchema = z.object({ type: z.enum(['milestone','progress']), title: z.string().trim().min(3).max(180), details: z.string().trim().max(3000) })
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export function SkProjectsPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'sk.manage'], queryFn: () => hasPermission(tenantId, 'sk.manage'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'sk.review'], queryFn: () => hasPermission(tenantId, 'sk.review'), enabled: Boolean(tenantId) })
  const enabled = Boolean(tenantId && (canManage.data || canReview.data))
  const projects = useQuery({ queryKey: ['sk-projects', tenantId], queryFn: () => listSkProjects(tenantId), enabled })
  const updates = useQuery({ queryKey: ['sk-project-updates', tenantId], queryFn: () => listSkProjectUpdates(tenantId), enabled })
  const [showForm, setShowForm] = useState(false)
  const [updateProject, setUpdateProject] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sk-projects', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['sk-project-updates', tenantId] }),
    ])
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = projectSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the project proposal.'); return }
    if (parsed.data.start && parsed.data.end && parsed.data.end < parsed.data.start) { setError('The planned end date must be after the start date.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await submitSkProject({ tenantId, title: parsed.data.title, description: parsed.data.description, budget: parsed.data.budget, start: parsed.data.start, end: parsed.data.end }); await refresh(); form.reset(); setShowForm(false); setMessage('SK project proposal submitted to the Captain for review.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit this proposal.') }
    finally { setBusy(false) }
  }

  async function review(projectId: string, approve: boolean) {
    const note = approve ? '' : window.prompt('Reason for rejecting this proposal:') ?? ''
    if (!approve && note.trim().length < 3) return
    if (approve && !window.confirm('Approve this SK project proposal?')) return
    setBusy(true); setError(''); setMessage('')
    try { await reviewSkProject(projectId, approve, note); await refresh(); setMessage(approve ? 'Project proposal approved.' : 'Project proposal rejected with a reason.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to review the proposal.') }
    finally { setBusy(false) }
  }

  async function advance(projectId: string, status: 'active' | 'completed') {
    if (!window.confirm(status === 'active' ? 'Start this approved project?' : 'Mark this project complete?')) return
    setBusy(true); setError(''); setMessage('')
    try { await updateSkProjectStatus(projectId, status); await refresh(); setMessage(status === 'active' ? 'Project marked active.' : 'Project marked complete.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the project.') }
    finally { setBusy(false) }
  }

  async function addUpdate(projectId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = updateSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the progress update.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await addSkProjectUpdate(projectId, parsed.data.type, parsed.data.title, parsed.data.details); await refresh(); form.reset(); setUpdateProject(''); setMessage('Project update recorded.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to add the project update.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="SK projects" description="Submit youth project proposals, review approvals, and record milestones and progress.">
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}>New proposal</button>}
    </PageHeading>
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {!canManage.data && !canReview.data && !canManage.isPending && !canReview.isPending && <div className="ops-panel archive-access"><FolderKanban size={20} /><div><strong>SK project access is restricted</strong><p>Access is limited to the SK Chairperson and authorized Captain reviewers.</p></div></div>}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void createProject(event)}><div className="ops-panel-heading"><div><h2>Submit an SK project proposal</h2><p>The barangay Captain must review proposals independently.</p></div><FileCheck2 size={19} /></div><div className="ops-form-grid"><label>Project title<input name="title" maxLength={180} required /></label><label>Proposed budget (PHP)<input name="budget" type="number" min="0" max="999999999999.99" step="0.01" defaultValue="0" required /><span className="field-hint">Proposal only; this does not approve or post a financial transaction.</span></label><label>Planned start<input name="start" type="date" /></label><label>Planned end<input name="end" type="date" /></label><label className="span-two">Project description<textarea name="description" minLength={3} maxLength={4000} required /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Submit for review</button></div></form>}
    {projects.isPending && enabled && <LoadingNotice />}{projects.error && <ErrorNotice message={projects.error.message} />}
    {projects.data?.length === 0 && <div className="ops-empty"><FolderKanban size={22} /><strong>No SK projects yet</strong><p>Submitted proposals and their review status will appear here.</p></div>}
    <div className="sk-project-list">{projects.data?.map((project) => {
      const projectUpdates = updates.data?.filter((update) => update.project_id === project.id) ?? []
      return <article className="ops-panel sk-project-card" key={project.id}>
        <div className="sk-project-header"><div><StatusPill status={project.status} /><h2>{project.title}</h2><p>{project.description}</p></div><strong className="sk-project-budget">{currency.format(Number(project.proposed_budget))}<small> proposed</small></strong></div>
        <div className="sk-project-meta"><span>Submitted {formatDateTime(project.created_at)}</span>{project.planned_start && <span>Start {new Date(`${project.planned_start}T00:00:00`).toLocaleDateString()}</span>}{project.planned_end && <span>End {new Date(`${project.planned_end}T00:00:00`).toLocaleDateString()}</span>}</div>
        {project.review_note && <p className="finance-review-note">Review note: {project.review_note}</p>}
        {canReview.data && project.status === 'submitted' && project.created_by !== user?.id && <div className="finance-review-actions"><button className="button outline danger-action" disabled={busy} onClick={() => void review(project.id, false)}>Reject with reason</button><button className="button primary" disabled={busy} onClick={() => void review(project.id, true)}>Approve proposal</button></div>}
        {canManage.data && project.status === 'approved' && <button className="button primary" disabled={busy} onClick={() => void advance(project.id, 'active')}>Start project</button>}
        {canManage.data && project.status === 'active' && <button className="button outline" disabled={busy} onClick={() => void advance(project.id, 'completed')}>Mark complete</button>}
        <section className="sk-project-updates"><h3>Milestones & progress <span>{projectUpdates.length}</span></h3>{projectUpdates.length ? <ul>{projectUpdates.map((update) => <li key={update.id}><span className="status-pill">{update.update_type}</span><div><strong>{update.title}</strong>{update.details && <p>{update.details}</p>}<small>{formatDateTime(update.created_at)}</small></div></li>)}</ul> : <p>No progress updates yet.</p>}
          {canManage.data && ['approved','active'].includes(project.status) && <>{updateProject === project.id ? <form className="sk-update-form" onSubmit={(event) => void addUpdate(project.id, event)}><label>Update type<select name="type"><option value="milestone">Milestone</option><option value="progress">Progress report</option></select></label><label>Title<input name="title" minLength={3} maxLength={180} required /></label><label>Details<textarea name="details" maxLength={3000} /></label><div className="finance-review-actions"><button type="button" className="button outline" onClick={() => setUpdateProject('')}>Cancel</button><button className="button primary" disabled={busy}>Save update</button></div></form> : <button className="button outline" disabled={busy} onClick={() => setUpdateProject(project.id)}>Add milestone or progress update</button>}</>}
        </section>
      </article>
    })}</div>
  </section>
}
