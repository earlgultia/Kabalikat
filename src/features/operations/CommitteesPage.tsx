import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, UsersRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { assignCommitteeMember, COMMITTEE_CONTENT_PAGE_SIZE, COMMITTEE_MEMBER_PAGE_SIZE, COMMITTEE_PAGE_SIZE, createCommittee, createCommitteeTask, listAssignableCommitteeMembers, listCommitteeMembers, listCommittees, listCommitteeTasks, updateCommitteeTaskStatus, type CommitteeTaskRow } from './committee-data'
import { hasPermission } from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const committeeSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000) })
const taskSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), assignedTo: z.string(), dueDate: z.string() })

function CommitteeMemberPicker({ tenantId, committeeId, busy, onAssign }: {
  tenantId: string; committeeId: string; busy: boolean; onAssign: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const candidates = useQuery({
    queryKey: ['committee-member-picker', tenantId, committeeId, page, search],
    queryFn: () => listAssignableCommitteeMembers(tenantId, committeeId, page, search), enabled: open,
  })
  const rows = candidates.data?.rows ?? []
  const total = candidates.data?.totalCount ?? 0
  const pages = Math.max(1, Math.ceil(total / COMMITTEE_MEMBER_PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])

  return <details className="committee-member-picker" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Add a member</summary>
    {open && <>
      <form className="committee-member-search" onSubmit={(event) => { event.preventDefault(); setPage(0); setSearch(searchInput.trim()) }}>
        <label>Search active members<input aria-label="Search active committee members" maxLength={100} placeholder="Name or role" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
        <button className="button outline" type="submit">Search</button>
      </form>
      {candidates.isPending && <p className="field-hint" role="status">Loading active members…</p>}
      {candidates.error && <p className="ops-error" role="alert">Unable to load active members. Try searching again.</p>}
      {candidates.data && total > 0 && <>
        <form className="committee-inline-form" onSubmit={onAssign}>
          <label>Choose a member<select name="userId" required defaultValue=""><option value="" disabled>Select active member</option>{rows.map((candidate) => <option key={candidate.user_id} value={candidate.user_id}>{candidate.display_name} · {candidate.role_label}</option>)}</select></label>
          <button className="button outline" disabled={busy || !rows.length}>Assign</button>
        </form>
        <div className="committee-picker-pagination"><span aria-live="polite">Showing {currentPage * COMMITTEE_MEMBER_PAGE_SIZE + 1}–{Math.min((currentPage + 1) * COMMITTEE_MEMBER_PAGE_SIZE, total)} of {total} available</span><div><button type="button" className="button outline" disabled={currentPage === 0 || candidates.isFetching} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentPage + 1 >= pages || candidates.isFetching} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
      </>}
      {candidates.data && total === 0 && <p className="field-hint">{search ? 'No active members match this search.' : 'All active members are already assigned.'}</p>}
    </>}
  </details>
}

function CommitteeWorkspaceCard({
  tenantId, committee, canManage, currentUserId, busy, onAssign, onAddTask, onChangeTask,
}: {
  tenantId: string
  committee: { id: string; name: string; description: string }
  canManage: boolean
  currentUserId: string
  busy: boolean
  onAssign: (event: FormEvent<HTMLFormElement>) => void
  onAddTask: (event: FormEvent<HTMLFormElement>) => void
  onChangeTask: (task: CommitteeTaskRow, status: CommitteeTaskRow['status']) => void
}) {
  const [membersOpen, setMembersOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [memberPage, setMemberPage] = useState(0)
  const [taskPage, setTaskPage] = useState(0)
  const members = useQuery({ queryKey: ['committee-members', tenantId, committee.id, memberPage], queryFn: () => listCommitteeMembers(tenantId, committee.id, memberPage), enabled: membersOpen })
  const tasks = useQuery({ queryKey: ['committee-tasks', tenantId, committee.id, taskPage], queryFn: () => listCommitteeTasks(tenantId, committee.id, taskPage), enabled: tasksOpen })
  const committeeMembers = members.data?.rows ?? []
  const committeeTasks = tasks.data?.rows ?? []
  const memberTotal = members.data?.totalCount ?? 0
  const taskTotal = tasks.data?.totalCount ?? 0
  const memberPages = Math.max(1, Math.ceil(memberTotal / COMMITTEE_CONTENT_PAGE_SIZE))
  const taskPages = Math.max(1, Math.ceil(taskTotal / COMMITTEE_CONTENT_PAGE_SIZE))
  const currentMemberPage = Math.min(memberPage, memberPages - 1)
  const currentTaskPage = Math.min(taskPage, taskPages - 1)
  useEffect(() => { if (memberPage !== currentMemberPage) setMemberPage(currentMemberPage) }, [currentMemberPage, memberPage])
  useEffect(() => { if (taskPage !== currentTaskPage) setTaskPage(currentTaskPage) }, [currentTaskPage, taskPage])

  return <article className="ops-panel committee-workspace" key={committee.id}>
    <div className="committee-workspace-heading"><div><span className="status-pill status-active">Active</span><h2>{committee.name}</h2><p>{committee.description || 'No description provided.'}</p></div><UsersRound size={20} /></div>
    <details className="committee-members" onToggle={(event) => setMembersOpen(event.currentTarget.open)}>
      <summary><h3>Members <span>{members.isPending && membersOpen ? '…' : members.data?.totalCount ?? '—'}</span></h3></summary>
      {membersOpen && members.isPending && <p className="field-hint" role="status">Loading committee members…</p>}
      {membersOpen && members.error && <p className="ops-error" role="alert">Unable to load committee members.</p>}
      {membersOpen && members.data && <>
        {committeeMembers.length ? <ul>{committeeMembers.map((member) => {
          const name = member.profile?.display_name || 'Assigned member'
          return <li key={member.user_id}><span className="committee-avatar">{name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span>{name}</span></li>
        })}</ul> : <p>No members assigned yet.</p>}
        {memberPages > 1 && <div className="committee-picker-pagination"><span>Page {currentMemberPage + 1} of {memberPages} · {memberTotal} members</span><div><button type="button" className="button outline" disabled={currentMemberPage === 0 || members.isFetching} onClick={() => setMemberPage(currentMemberPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentMemberPage + 1 >= memberPages || members.isFetching} onClick={() => setMemberPage(currentMemberPage + 1)}>Next</button></div></div>}
      </>}
      {canManage && <CommitteeMemberPicker tenantId={tenantId} committeeId={committee.id} busy={busy} onAssign={onAssign} />}
    </details>
    <details className="committee-tasks" onToggle={(event) => setTasksOpen(event.currentTarget.open)}>
      <summary><h3>Action items <span>{tasks.isPending && tasksOpen ? '…' : tasks.data?.totalCount ?? '—'}</span></h3></summary>
      {tasksOpen && tasks.isPending && <p className="field-hint" role="status">Loading action items…</p>}
      {tasksOpen && tasks.error && <p className="ops-error" role="alert">Unable to load committee action items.</p>}
      {tasksOpen && tasks.data && <>
        {committeeTasks.length ? <ul>{committeeTasks.map((task) => <li key={task.id}><div><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}<small>{task.assigned_to ? `Assigned to ${task.assignee_name || (task.assigned_to === currentUserId ? 'You' : 'Assigned member')}` : 'Unassigned'}{task.due_date ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}` : ''}</small></div><div className="committee-task-status"><StatusPill status={task.status} />{(canManage || task.assigned_to === currentUserId) && <select aria-label={`Update status for ${task.title}`} value={task.status} disabled={busy} onChange={(event) => onChangeTask(task, event.target.value as CommitteeTaskRow['status'])}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select>}</div></li>)}</ul> : <p>No action items yet.</p>}
        {taskPages > 1 && <div className="committee-picker-pagination"><span>Page {currentTaskPage + 1} of {taskPages} · {taskTotal} action items</span><div><button type="button" className="button outline" disabled={currentTaskPage === 0 || tasks.isFetching} onClick={() => setTaskPage(currentTaskPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentTaskPage + 1 >= taskPages || tasks.isFetching} onClick={() => setTaskPage(currentTaskPage + 1)}>Next</button></div></div>}
      </>}
      <form className="committee-task-form" onSubmit={onAddTask}><label>Action item<input name="title" placeholder="Prepare a community proposal" maxLength={180} required /></label><label>Details<textarea name="description" maxLength={2000} /></label><div className="committee-task-form-row">{canManage && <label>Assign to<select name="assignedTo" defaultValue=""><option value="">Unassigned</option>{committeeMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.profile?.display_name || 'Assigned member'}</option>)}</select></label>}{!canManage && <input type="hidden" name="assignedTo" value={currentUserId} />}<label>Due date<input type="date" name="dueDate" /></label><button className="button primary" disabled={busy}>Add action item</button></div></form>
    </details>
  </article>
}

export function CommitteesPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [tenantId])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'committee.manage'], queryFn: () => hasPermission(tenantId, 'committee.manage'), enabled: Boolean(tenantId) })
  const committees = useQuery({ queryKey: ['committees', tenantId, page], queryFn: () => listCommittees(tenantId, page), enabled: Boolean(tenantId) })
  const totalPages = Math.ceil((committees.data?.totalCount ?? 0) / COMMITTEE_PAGE_SIZE)
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['committees', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['committee-tasks', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['committee-members', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['committee-member-picker', tenantId] }),
    ])
  }

  async function submitCommittee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = committeeSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the committee details.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await createCommittee(tenantId, parsed.data.name, parsed.data.description); setPage(0); await refresh(); form.reset(); setShowCreate(false); setMessage('Committee created.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to create this committee.') }
    finally { setBusy(false) }
  }

  async function assignMember(committeeId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const userId = String(new FormData(form).get('userId') ?? '')
    if (!userId) return
    setBusy(true); setError(''); setMessage('')
    try { await assignCommitteeMember(committeeId, userId); await refresh(); form.reset(); setMessage('Member assigned to the committee.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to assign this member.') }
    finally { setBusy(false) }
  }

  async function addTask(committeeId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = taskSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the action item.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await createCommitteeTask({ committeeId, title: parsed.data.title, description: parsed.data.description,
        assignedTo: canManage.data ? parsed.data.assignedTo : user?.id ?? '', dueDate: parsed.data.dueDate })
      await refresh(); form.reset(); setMessage('Action item added to the committee workspace.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add this action item.') }
    finally { setBusy(false) }
  }

  async function changeStatus(task: CommitteeTaskRow, status: CommitteeTaskRow['status']) {
    setBusy(true); setError(''); setMessage('')
    try { await updateCommitteeTaskStatus(task.id, status); await refresh(); setMessage('Action item status updated.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the action item.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Committee workspaces" description="Coordinate assigned members and track committee action items.">
      {canManage.data && <button className="button primary" onClick={() => setShowCreate((visible) => !visible)}>New committee</button>}
    </PageHeading>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view assigned committee workspaces." />}
    {Boolean(tenantId) && canManage.isPending && <LoadingNotice compact />}
    {canManage.error && <ErrorNotice message="Committee management access could not be checked. Existing assignments can still be viewed; management controls are unavailable until access can be verified." />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canManage.isPending && !canManage.error && !canManage.data && <div className="ops-panel archive-access"><UsersRound size={20} /><div><strong>Committee access is assignment-based</strong><p>You will see committees after an authorized administrator assigns you to one.</p></div></div>}
    {showCreate && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void submitCommittee(event)}><div className="ops-panel-heading"><div><h2>Create a committee</h2><p>Only authorized committee managers can configure workspaces.</p></div><UsersRound size={18} /></div><div className="ops-form-grid"><label>Committee name<input name="name" maxLength={120} required /></label><label className="span-two">Purpose / description<textarea name="description" maxLength={1000} /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Create committee</button></div></form>}
    {committees.isPending && tenantId && <LoadingNotice />}{committees.error && <ErrorNotice message={committees.error.message} />}
    {committees.data?.totalCount === 0 && <div className="ops-empty"><UsersRound size={22} /><strong>No committee workspaces assigned</strong><p>Ask an authorized Captain or Secretary to create or assign a committee.</p></div>}
    <div className="committee-workspace-list">{committees.data?.rows.map((committee) => <CommitteeWorkspaceCard key={committee.id} tenantId={tenantId} committee={committee} canManage={Boolean(canManage.data)} currentUserId={user?.id ?? ''} busy={busy} onAssign={(event) => void assignMember(committee.id, event)} onAddTask={(event) => void addTask(committee.id, event)} onChangeTask={(task, status) => void changeStatus(task, status)} />)}</div>
    {totalPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="Committee pages">
      <span className="muted">Page {page + 1} of {totalPages} - {committees.data?.totalCount ?? 0} committees</span>
      <div className="finance-review-actions">
        <button className="button outline" disabled={page === 0 || committees.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button>
        <button className="button outline" disabled={page + 1 >= totalPages || committees.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button>
      </div>
    </nav>}
  </section>
}
