import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, Download, FolderKanban, Plus, Waypoints } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { addBarangayProjectUpdate, BARANGAY_PROJECT_PAGE_SIZE, createBarangayProject, listBarangayProjects, listKagawadProjectContributions, updateBarangayProjectStatus, type BarangayProject } from './projects-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'
import { BarangayProjectUpdateResponseThread, ProjectProgressHistory } from './ProjectHistory'
import { encodeCsv } from './csv'

const projectSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(4000), start: z.string(), end: z.string() })
const updateSchema = z.object({ type: z.enum(['milestone', 'progress']), title: z.string().trim().min(3).max(180), details: z.string().trim().max(3000) })
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString()

const transitions: Record<BarangayProject['status'], Array<{ label: string; status: BarangayProject['status'] }>> = {
  planned: [{ label: 'Start project', status: 'active' }, { label: 'Cancel project', status: 'cancelled' }],
  active: [{ label: 'Pause project', status: 'paused' }, { label: 'Mark complete', status: 'completed' }, { label: 'Cancel project', status: 'cancelled' }],
  paused: [{ label: 'Resume project', status: 'active' }, { label: 'Cancel project', status: 'cancelled' }],
  completed: [], cancelled: [],
}

export function ProjectsPage({ focusProjectId, focusProjectPage, focusUpdateId, focusUpdatePage, focusResponsePage, openResponseThread, onFocusHandled }: { focusProjectId?: string; focusProjectPage?: number; focusUpdateId?: string; focusUpdatePage?: number; focusResponsePage?: number; openResponseThread?: boolean; onFocusHandled?: () => void }) {
  const { membership } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [contributionPage, setContributionPage] = useState(0)
  const [contributionFilters, setContributionFilters] = useState({ search: '', updateType: 'all', createdAfter: '', createdBefore: '' })
  const [contributionDraft, setContributionDraft] = useState({ search: '', updateType: 'all', createdAfter: '', createdBefore: '' })
  const isKagawad = membership?.role?.key === 'kagawad'
  useEffect(() => { setPage(0); setContributionPage(0); setContributionFilters({ search: '', updateType: 'all', createdAfter: '', createdBefore: '' }); setContributionDraft({ search: '', updateType: 'all', createdAfter: '', createdBefore: '' }) }, [tenantId])
  useEffect(() => { if (focusProjectId) setPage(focusProjectPage ?? 0) }, [focusProjectId, focusProjectPage])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'project.manage'], queryFn: () => hasPermission(tenantId, 'project.manage'), enabled: Boolean(tenantId) })
  const canContribute = useQuery({ queryKey: ['permission', tenantId, 'project.update'], queryFn: () => hasPermission(tenantId, 'project.update'), enabled: Boolean(tenantId && isKagawad) })
  const canRecordUpdates = Boolean(canManage.data || canContribute.data)
  const projects = useQuery({ queryKey: ['barangay-projects', tenantId, page], queryFn: () => listBarangayProjects(tenantId, page), enabled: Boolean(tenantId) })
  const contributions = useQuery({ queryKey: ['kagawad-project-contributions', tenantId, contributionPage, contributionFilters], queryFn: () => listKagawadProjectContributions(tenantId, contributionPage, contributionFilters), enabled: Boolean(tenantId && isKagawad && canContribute.data) })
  const contributionPages = Math.ceil((contributions.data?.totalCount ?? 0) / 10)
  const totalPages = Math.ceil((projects.data?.totalCount ?? 0) / BARANGAY_PROJECT_PAGE_SIZE)
  const [showForm, setShowForm] = useState(false)
  const [updateProject, setUpdateProject] = useState('')
  const [busy, setBusy] = useState(false)
  const [exportingContributions, setExportingContributions] = useState(false)
  const [contributionExportMessage, setContributionExportMessage] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['barangay-projects', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['project-progress-history', 'barangay', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['kagawad-project-contributions', tenantId] }),
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

  async function exportKagawadContributions() {
    setExportingContributions(true)
    setContributionExportMessage('Preparing your matching contribution history…')
    try {
      const firstPage = await listKagawadProjectContributions(tenantId, 0, contributionFilters, 50)
      if (firstPage.totalCount > 10_000) {
        throw new Error('There are more than 10,000 matching records. Add a date or search filter and try again.')
      }
      const rows = [...firstPage.rows]
      const pageCount = Math.ceil(firstPage.totalCount / 50)
      for (let exportPage = 1; exportPage < pageCount; exportPage += 1) {
        const result = await listKagawadProjectContributions(tenantId, exportPage, contributionFilters, 50)
        rows.push(...result.rows)
      }
      const csv = encodeCsv([
        ['Project', 'Project status', 'Update type', 'Title', 'Details', 'Recorded at'],
        ...rows.map((row) => [row.project_title, row.project_status, row.update_type, row.title, row.details, row.created_at]),
      ])
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `kabalikat-my-project-contributions-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setContributionExportMessage(`Export ready with ${rows.length.toLocaleString()} matching contributions.`)
    } catch (exportError) {
      setContributionExportMessage(exportError instanceof Error && exportError.message.startsWith('There are more than')
        ? exportError.message
        : 'Unable to export your contributions. Try again.')
    } finally {
      setExportingContributions(false)
    }
  }

  return <section className="operation-page">
    <PageHeading title="Barangay projects" description="Track community projects, planned dates, status, and progress updates.">
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}><Plus size={15} />New project</button>}
    </PageHeading>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view project status and progress." />}
    {Boolean(tenantId) && canManage.isPending && <LoadingNotice compact />}
    {canManage.error && <ErrorNotice message="Project management access could not be checked. Project records remain available under your current access; management controls are unavailable until permissions can be verified." onRetry={() => void canManage.refetch()} retrying={canManage.isFetching} />}
    {isKagawad && canContribute.error && <ErrorNotice message="Project contribution access could not be checked. Your contribution history and update controls are unavailable until permissions can be verified." onRetry={() => void canContribute.refetch()} retrying={canContribute.isFetching} />}
    {message && <div className="ops-success" role="status"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canManage.data && !canContribute.data && !canManage.isPending && (!isKagawad || !canContribute.isPending) && !canManage.error && !canContribute.error && <div className="ops-panel archive-access"><FolderKanban size={20} /><div><strong>Read-only project access</strong><p>Active barangay members can view project status. Creating projects and recording updates is limited to authorized members.</p></div></div>}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void createProject(event)}><div className="ops-panel-heading"><div><h2>New barangay project</h2><p>Project notes are separate from the official finance ledger.</p></div><FolderKanban size={19} /></div><div className="ops-form-grid"><label>Project title<input name="title" minLength={3} maxLength={180} required /></label><label>Planned start<input name="start" type="date" /></label><label>Planned end<input name="end" type="date" /></label><label className="span-two">Description<textarea name="description" maxLength={4000} /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Create project</button></div></form>}
    {isKagawad && <section className="ops-panel kagawad-project-contributions" aria-labelledby="kagawad-project-contributions-title">
      <div className="ops-panel-heading"><div><h2 id="kagawad-project-contributions-title">Your project contributions</h2><p>Progress reports and milestones you have recorded.</p></div><FolderKanban size={19} /></div>
      {canContribute.isPending && <LoadingNotice compact />}
      {canContribute.data === false && !canContribute.isPending && !canContribute.error && <p className="field-hint">Your account does not have permission to record or view project contributions in this workspace.</p>}
      {canContribute.data && contributions.isPending && <LoadingNotice compact />}
      {canContribute.data && contributions.error && <ErrorNotice message="Your project contribution history could not be loaded." onRetry={() => void contributions.refetch()} retrying={contributions.isFetching} />}
      {canContribute.data && contributions.data?.totalCount === 0 && <p className="field-hint">{contributionFilters.search || contributionFilters.updateType !== 'all' || contributionFilters.createdAfter || contributionFilters.createdBefore ? 'No contributions match these filters.' : 'You have not recorded any project updates yet.'}</p>}
      {canContribute.data && <form className="kagawad-contribution-filters" onSubmit={(event) => { event.preventDefault(); if (contributionDraft.createdAfter && contributionDraft.createdBefore && contributionDraft.createdAfter > contributionDraft.createdBefore) { setError('The start date must be on or before the end date.'); return } setError(''); setContributionPage(0); setContributionFilters({ ...contributionDraft, search: contributionDraft.search.trim() }) }}>
        <label className="kagawad-contribution-search">Search your updates<input type="search" maxLength={100} placeholder="Project, title, or details" value={contributionDraft.search} onChange={(event) => setContributionDraft((current) => ({ ...current, search: event.target.value }))} /></label>
        <label>Update type<select value={contributionDraft.updateType} onChange={(event) => setContributionDraft((current) => ({ ...current, updateType: event.target.value }))}><option value="all">All types</option><option value="progress">Progress reports</option><option value="milestone">Milestones</option></select></label>
        <label>Created on or after<input type="date" value={contributionDraft.createdAfter} onChange={(event) => setContributionDraft((current) => ({ ...current, createdAfter: event.target.value }))} /></label>
        <label>Created on or before<input type="date" value={contributionDraft.createdBefore} onChange={(event) => setContributionDraft((current) => ({ ...current, createdBefore: event.target.value }))} /></label>
        <div className="kagawad-contribution-filter-actions"><button className="button primary" type="submit">Apply filters</button><button className="button outline" type="button" onClick={() => { const empty = { search: '', updateType: 'all', createdAfter: '', createdBefore: '' }; setContributionDraft(empty); setContributionFilters(empty); setContributionPage(0); setError(''); setContributionExportMessage('') }}>Clear</button><button className="button outline" type="button" onClick={() => void exportKagawadContributions()} disabled={exportingContributions || !contributions.data?.totalCount}><Download size={15} />{exportingContributions ? 'Preparing…' : 'Export CSV'}</button></div>
      </form>}
      {canContribute.data && contributionExportMessage && <p className="field-hint" role={contributionExportMessage.startsWith('There are more than') || contributionExportMessage.startsWith('Unable') ? 'alert' : 'status'}>{contributionExportMessage}</p>}
      {canContribute.data && Boolean(contributions.data?.rows.length) && <ol className="kagawad-contribution-list">{contributions.data?.rows.map((entry) => <li key={entry.update_id}>
        <div><strong>{entry.title}</strong><span className="status-pill">{entry.update_type === 'milestone' ? 'Milestone' : 'Progress report'}</span></div>
        <p className="kagawad-contribution-project">{entry.project_title} · {entry.project_status.replaceAll('_', ' ')}</p>
        {entry.details && <p>{entry.details}</p>}
        <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
        <BarangayProjectUpdateResponseThread updateId={entry.update_id} isOwnUpdate canRespond={false} />
      </li>)}</ol>}
      {canContribute.data && contributionPages > 1 && <div className="committee-picker-pagination"><span>Page {contributionPage + 1} of {contributionPages} · {contributions.data?.totalCount ?? 0} updates</span><div><button type="button" className="button outline" disabled={contributionPage === 0 || contributions.isFetching} onClick={() => setContributionPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={contributionPage + 1 >= contributionPages || contributions.isFetching} onClick={() => setContributionPage((current) => current + 1)}>Next</button></div></div>}
    </section>}
    {projects.isPending && tenantId && <LoadingNotice />}
    {projects.error && <ErrorNotice message="Unable to load project records." onRetry={() => void projects.refetch()} retrying={projects.isFetching} />}
    {projects.data?.totalCount === 0 && <div className="ops-empty kagawad-projects-empty"><FolderKanban size={22} /><strong>No barangay projects yet</strong><p>When an authorized official adds a project, its status and progress will appear here.</p></div>}
    <div className="barangay-project-list">{projects.data?.rows.map((project) => {
      return <article className="ops-panel barangay-project-card" key={project.id}>
        <div className="barangay-project-header"><div><StatusPill status={project.status} /><h2>{project.title}</h2><p>{project.description || 'No description provided.'}</p></div><Waypoints size={21} aria-hidden="true" /></div>
        {(project.planned_start || project.planned_end) && <div className="sk-project-meta">{project.planned_start && <span>Start {dateLabel(project.planned_start)}</span>}{project.planned_end && <span>End {dateLabel(project.planned_end)}</span>}<span>Created {formatDateTime(project.created_at)}</span></div>}
        {canManage.data && <div className="finance-review-actions">{transitions[project.status].map((action) => <button key={action.status} className={action.status === 'cancelled' ? 'button outline danger-action' : 'button outline'} disabled={busy} onClick={() => void changeStatus(project, action.status)}>{action.label}</button>)}</div>}
        <section className="sk-project-updates"><ProjectProgressHistory tenantId={tenantId} projectId={project.id} scope="barangay" canRespond={Boolean(canManage.data)} focusUpdateId={project.id === focusProjectId ? focusUpdateId : undefined} focusUpdatePage={focusUpdatePage} focusResponsePage={focusResponsePage} openResponseThread={Boolean(openResponseThread && project.id === focusProjectId)} onFocusHandled={onFocusHandled} />
          {canRecordUpdates && ['active', 'paused'].includes(project.status) && <>{updateProject === project.id ? <form className="sk-update-form" onSubmit={(event) => void addUpdate(project.id, event)}><label>Update type<select name="type"><option value="progress">Progress report</option><option value="milestone">Milestone</option></select></label><label>Title<input name="title" minLength={3} maxLength={180} required /></label><label>Details<textarea name="details" maxLength={3000} /></label><div className="finance-review-actions"><button type="button" className="button outline" onClick={() => setUpdateProject('')}>Cancel</button><button className="button primary" disabled={busy}>Save update</button></div></form> : <button className="button outline" disabled={busy} onClick={() => setUpdateProject(project.id)}>Add milestone or progress update</button>}</>}
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
