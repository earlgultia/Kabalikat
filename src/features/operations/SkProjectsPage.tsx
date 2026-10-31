import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, FileCheck2, FolderKanban } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { addSkProjectUpdate, listSkAccomplishmentsForProjects, listSkProjects, reviewSkAccomplishment, reviewSkProject, SK_PROJECT_PAGE_SIZE, submitSkAccomplishment, submitSkProject, updateSkProjectStatus } from './sk-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'
import { ProjectProgressHistory, SkProjectActivityHistory } from './ProjectHistory'

const projectSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().min(3).max(4000), budget: z.coerce.number().min(0).max(999999999999.99), start: z.string(), end: z.string() })
const updateSchema = z.object({ type: z.enum(['milestone','progress']), title: z.string().trim().min(3).max(180), details: z.string().trim().max(3000) })
const accomplishmentSchema = z.object({ title: z.string().trim().min(3).max(180), summary: z.string().trim().min(20).max(2000) })
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export function SkProjectsPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [tenantId])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'sk.manage'], queryFn: () => hasPermission(tenantId, 'sk.manage'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'sk.review'], queryFn: () => hasPermission(tenantId, 'sk.review'), enabled: Boolean(tenantId) })
  const enabled = Boolean(tenantId && (canManage.data || canReview.data))
  const projects = useQuery({ queryKey: ['sk-projects', tenantId, page], queryFn: () => listSkProjects(tenantId, page), enabled })
  const projectIds = projects.data?.rows.map((project) => project.id) ?? []
  const accomplishments = useQuery({ queryKey: ['sk-accomplishments', tenantId, projectIds], queryFn: () => listSkAccomplishmentsForProjects(tenantId, projectIds), enabled: enabled && projectIds.length > 0 })
  const totalPages = Math.ceil((projects.data?.totalCount ?? 0) / SK_PROJECT_PAGE_SIZE)
  const [showForm, setShowForm] = useState(false)
  const [updateProject, setUpdateProject] = useState('')
  const [summaryProject, setSummaryProject] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sk-projects', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['project-progress-history', 'sk', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['sk-accomplishments', tenantId] }),
    ])
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = projectSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the project proposal.'); return }
    if (parsed.data.start && parsed.data.end && parsed.data.end < parsed.data.start) { setError('The planned end date must be after the start date.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await submitSkProject({ tenantId, title: parsed.data.title, description: parsed.data.description, budget: parsed.data.budget, start: parsed.data.start, end: parsed.data.end }); setPage(0); await refresh(); form.reset(); setShowForm(false); setMessage('SK project proposal submitted to the Captain for review.') }
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

  async function submitAccomplishment(projectId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = accomplishmentSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the accomplishment summary.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await submitSkAccomplishment(tenantId, projectId, parsed.data.title, parsed.data.summary); await refresh(); form.reset(); setSummaryProject(''); setMessage('Accomplishment summary submitted to the Captain for publication review.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit this summary.') }
    finally { setBusy(false) }
  }

  async function reviewAccomplishment(id: string, publish: boolean) {
    const note = publish ? null : window.prompt('Why is this summary being returned? (3–1000 characters):')?.trim() ?? ''
    if (!publish && (!note || note.length < 3 || note.length > 1000)) return
    if (publish && !window.confirm('Publish this accomplishment summary to active barangay members?')) return
    setBusy(true); setError(''); setMessage('')
    try { await reviewSkAccomplishment(id, publish, note); await refresh(); setMessage(publish ? 'Accomplishment published to the barangay workspace.' : 'Summary returned to the SK Chairperson with a reason.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to review this summary.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="SK projects" description="Submit youth project proposals, review approvals, and record milestones and progress.">
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}>New proposal</button>}
    </PageHeading>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view SK projects." />}
    {Boolean(tenantId) && (canManage.isPending || canReview.isPending) && <LoadingNotice compact />}
    {(canManage.error || canReview.error) && <ErrorNotice message="Your SK project access could not be checked. Refresh the page or contact your barangay administrator." />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canManage.data && !canReview.data && !canManage.isPending && !canReview.isPending && !canManage.error && !canReview.error && <EmptyNotice title="SK project access is restricted" detail="Access is limited to the SK Chairperson and authorized Captain reviewers. Contact your barangay administrator if you need access." />}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void createProject(event)}><div className="ops-panel-heading"><div><h2>Submit an SK project proposal</h2><p>The barangay Captain must review proposals independently.</p></div><FileCheck2 size={19} /></div><div className="ops-form-grid"><label>Project title<input name="title" maxLength={180} required /></label><label>Proposed budget (PHP)<input name="budget" type="number" min="0" max="999999999999.99" step="0.01" defaultValue="0" required /><span className="field-hint">Proposal only; this does not approve or post a financial transaction.</span></label><label>Planned start<input name="start" type="date" /></label><label>Planned end<input name="end" type="date" /></label><label className="span-two">Project description<textarea name="description" minLength={3} maxLength={4000} required /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Submit for review</button></div></form>}
    {projects.isPending && enabled && <LoadingNotice />}{projects.error && <ErrorNotice message={projects.error.message} />}
    {projects.data?.totalCount === 0 && <div className="ops-empty"><FolderKanban size={22} /><strong>No SK projects yet</strong><p>Submitted proposals and their review status will appear here.</p></div>}
    <div className="sk-project-list">{projects.data?.rows.map((project) => {
      return <article className="ops-panel sk-project-card" key={project.id}>
        <div className="sk-project-header"><div><StatusPill status={project.status} /><h2>{project.title}</h2><p>{project.description}</p></div><strong className="sk-project-budget">{currency.format(Number(project.proposed_budget))}<small> proposed</small></strong></div>
        <div className="sk-project-meta"><span>Submitted {formatDateTime(project.created_at)}</span>{project.planned_start && <span>Start {new Date(`${project.planned_start}T00:00:00`).toLocaleDateString()}</span>}{project.planned_end && <span>End {new Date(`${project.planned_end}T00:00:00`).toLocaleDateString()}</span>}</div>
        {project.review_note && <p className="finance-review-note">Review note: {project.review_note}</p>}
        {(canManage.data || canReview.data) && <SkProjectActivityHistory tenantId={tenantId} projectId={project.id} />}
        {(() => {
          const summary = accomplishments.data?.find((item) => item.project_id === project.id)
          const canResubmit = summary?.status === 'returned' && summary.created_by === user?.id
          return <section className="sk-project-updates sk-accomplishment-editor"><h3>Public accomplishment summary</h3>
            {summary && <><StatusPill status={summary.status} />{summary.review_note && <p className="finance-review-note">Captain’s note: {summary.review_note}</p>}{summary.status === 'published' && <p className="field-hint">This curated summary is visible to active barangay members.</p>}</>}
            {canReview.data && summary?.status === 'submitted' && summary.created_by !== user?.id && <div className="finance-review-actions"><button className="button outline danger-action" disabled={busy} onClick={() => void reviewAccomplishment(summary.id, false)}>Return with reason</button><button className="button primary" disabled={busy} onClick={() => void reviewAccomplishment(summary.id, true)}>Publish summary</button></div>}
            {canManage.data && project.status === 'completed' && (!summary || canResubmit) && (summaryProject === project.id ? <form className="sk-update-form" onSubmit={(event) => void submitAccomplishment(project.id, event)}><label>Public title<input name="title" minLength={3} maxLength={180} defaultValue={summary?.title ?? project.title} required /></label><label>Accomplishment summary<textarea name="summary" minLength={20} maxLength={2000} required defaultValue={summary?.summary ?? ''} /><span className="field-hint">Include results suitable for public sharing only. Exclude participant names, personal details, and private financial information.</span></label><div className="finance-review-actions"><button type="button" className="button outline" onClick={() => setSummaryProject('')}>Cancel</button><button className="button primary" disabled={busy}>Submit for Captain review</button></div></form> : <button className="button outline" disabled={busy} onClick={() => setSummaryProject(project.id)}>{canResubmit ? 'Revise returned summary' : 'Prepare public summary'}</button>)}
          </section>
        })()}
        {canReview.data && project.status === 'submitted' && project.created_by !== user?.id && <div className="finance-review-actions"><button className="button outline danger-action" disabled={busy} onClick={() => void review(project.id, false)}>Reject with reason</button><button className="button primary" disabled={busy} onClick={() => void review(project.id, true)}>Approve proposal</button></div>}
        {canManage.data && project.status === 'approved' && <button className="button primary" disabled={busy} onClick={() => void advance(project.id, 'active')}>Start project</button>}
        {canManage.data && project.status === 'active' && <button className="button outline" disabled={busy} onClick={() => void advance(project.id, 'completed')}>Mark complete</button>}
        <section className="sk-project-updates"><ProjectProgressHistory tenantId={tenantId} projectId={project.id} scope="sk" />
          {canManage.data && ['approved','active'].includes(project.status) && <>{updateProject === project.id ? <form className="sk-update-form" onSubmit={(event) => void addUpdate(project.id, event)}><label>Update type<select name="type"><option value="milestone">Milestone</option><option value="progress">Progress report</option></select></label><label>Title<input name="title" minLength={3} maxLength={180} required /></label><label>Details<textarea name="details" maxLength={3000} /></label><div className="finance-review-actions"><button type="button" className="button outline" onClick={() => setUpdateProject('')}>Cancel</button><button className="button primary" disabled={busy}>Save update</button></div></form> : <button className="button outline" disabled={busy} onClick={() => setUpdateProject(project.id)}>Add milestone or progress update</button>}</>}
        </section>
      </article>
    })}</div>
    {totalPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="SK project pages">
      <span className="muted">Page {page + 1} of {totalPages} · {projects.data?.totalCount ?? 0} proposals</span>
      <div className="finance-review-actions">
        <button className="button outline" disabled={page === 0 || projects.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button>
        <button className="button outline" disabled={page + 1 >= totalPages || projects.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button>
      </div>
    </nav>}
  </section>
}
