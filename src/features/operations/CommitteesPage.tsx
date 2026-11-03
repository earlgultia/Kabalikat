import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, History, MessageSquareText, UsersRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { addCommitteeTaskProgressNote, addKagawadActionItemNote, assignCommitteeMember, completeKagawadTask, COMMITTEE_CONTENT_PAGE_SIZE, COMMITTEE_MEMBER_PAGE_SIZE, COMMITTEE_PAGE_SIZE, createCommittee, createCommitteeTask, decideCommitteeTaskDueDateRequest, getCommitteeTaskNotificationContext, listAssignableCommitteeMembers, listCommitteeMembers, listCommittees, listCommitteeTasks, listCommitteeTaskDueDateRequests, listKagawadActionItemNotes, listKagawadAssignedActionItems, listKagawadTaskAssignmentHistory, listKagawadTaskDueDateRequestHistory, listKagawadTaskStatusHistory, requestCommitteeTaskDueDate, reportKagawadTaskBlocker, updateCommitteeTaskStatus, type CommitteeTaskDueDateReview, type CommitteeTaskRow } from './committee-data'
import { hasPermission } from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const committeeSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000) })
const taskSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), assignedTo: z.string(), dueDate: z.string() })
const taskNoteSchema = z.string().trim().min(3).max(2000)

function KagawadTaskStatusHistory({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const history = useQuery({ queryKey: ['kagawad-task-status-history', taskId, page], queryFn: () => listKagawadTaskStatusHistory(taskId, page), enabled: open })
  const totalPages = Math.max(1, Math.ceil((history.data?.totalCount ?? 0) / 10))
  const currentPage = Math.min(page, totalPages - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])
  return <div className="kagawad-status-history">
    <button type="button" className="text-action kagawad-task-note-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}><History size={14} />{open ? 'Hide status history' : 'Status history'}</button>
    {open && <div className="kagawad-status-history-content">
      {history.isPending ? <LoadingNotice compact /> : history.error ? <ErrorNotice message="Task status history could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} /> : history.data?.rows.length ? <ol>{history.data.rows.map((entry) => <li key={entry.id}><strong>{entry.details}</strong><small>{entry.actor_name} · {new Date(entry.created_at).toLocaleString()}</small></li>)}</ol> : <p className="field-hint">No status changes have been recorded yet.</p>}
      {history.data && history.data.totalCount > 10 && <div className="committee-picker-pagination"><span>Page {currentPage + 1} of {totalPages} · {history.data.totalCount} changes</span><div><button type="button" className="button outline" disabled={currentPage === 0 || history.isFetching} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentPage + 1 >= totalPages || history.isFetching} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}
    </div>}
  </div>
}

function CommitteeTaskNotesViewer({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const notes = useQuery({ queryKey: ['committee-task-notes', taskId], queryFn: () => listKagawadActionItemNotes(taskId) })
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = taskNoteSchema.safeParse(draft)
    if (!parsed.success) { setError('Add an update between 3 and 2,000 characters.'); return }
    setBusy(true); setError('')
    try {
      await addCommitteeTaskProgressNote(taskId, parsed.data)
      setDraft('')
      await queryClient.invalidateQueries({ queryKey: ['committee-task-notes', taskId] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add this task update.') }
    finally { setBusy(false) }
  }
  return <div className="kagawad-task-notes committee-task-notes-viewer">
    {notes.isPending ? <LoadingNotice compact /> : notes.error ? <ErrorNotice message="Task progress notes could not be loaded." onRetry={() => void notes.refetch()} retrying={notes.isFetching} /> : notes.data?.length ? <ol>{notes.data.map((note) => <li key={note.id}><p>{note.note}</p><small>{note.author_name} · {new Date(note.created_at).toLocaleString()}</small></li>)}</ol> : <p className="field-hint">No progress notes have been added.</p>}
    {error && <ErrorNotice message={error} />}
    <form onSubmit={(event) => void submit(event)}><label htmlFor={`manager-task-note-${taskId}`}>Add a manager response<textarea id={`manager-task-note-${taskId}`} value={draft} maxLength={2000} minLength={3} required placeholder="Share guidance or a follow-up request." onChange={(event) => setDraft(event.target.value)} /></label><button className="button outline" disabled={busy || draft.trim().length < 3}>{busy ? 'Adding…' : 'Add response'}</button></form>
  </div>
}

function KagawadDueDateRequestPanel({ taskId, currentDueDate, disabled }: { taskId: string; currentDueDate: string | null; disabled: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [proposedDate, setProposedDate] = useState('')
  const [reason, setReason] = useState('')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useQuery({ queryKey: ['kagawad-task-due-date-request-history', taskId, page], queryFn: () => listKagawadTaskDueDateRequestHistory(taskId, page), enabled: open })
  const latestRequest = request.data?.rows[0]
  const totalPages = Math.max(1, Math.ceil((request.data?.totalCount ?? 0) / 5))
  const currentPage = Math.min(page, totalPages - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])
  const minDate = new Date(); minDate.setDate(minDate.getDate() + 1)
  const minDateValue = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}-${String(minDate.getDate()).padStart(2, '0')}`
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = taskNoteSchema.safeParse(reason)
    if (!parsed.success || !proposedDate || proposedDate < minDateValue || proposedDate === currentDueDate) { setError('Choose a different future date and explain the request in at least 3 characters.'); return }
    setBusy(true); setError('')
    try {
      await requestCommitteeTaskDueDate(taskId, proposedDate, parsed.data)
      setReason(''); setProposedDate('')
      setPage(0)
      await queryClient.invalidateQueries({ queryKey: ['kagawad-task-due-date-request-history', taskId] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit the due-date request.') }
    finally { setBusy(false) }
  }
  return <div className="kagawad-due-date-request">
    <button type="button" className="text-action kagawad-task-note-toggle" aria-expanded={open} disabled={disabled} onClick={() => setOpen((value) => !value)}>{open ? 'Close due-date request' : 'Request due-date change'}</button>
    {open && <div className="kagawad-due-date-request-content">
      {request.isPending && <LoadingNotice compact />}
      {request.error && <ErrorNotice message="Your due-date request could not be loaded." onRetry={() => void request.refetch()} retrying={request.isFetching} />}
      {request.data?.rows.map((entry) => <article key={entry.id} className={`due-date-request-status ${entry.status}`}><strong>{entry.status === 'pending' ? 'Awaiting manager review' : entry.status === 'approved' ? 'Approved' : 'Declined'}</strong><span>{entry.current_due_date ? `Requested ${new Date(`${entry.current_due_date}T00:00:00`).toLocaleDateString()} → ${new Date(`${entry.proposed_due_date}T00:00:00`).toLocaleDateString()}` : `Proposed date: ${new Date(`${entry.proposed_due_date}T00:00:00`).toLocaleDateString()}`}</span><p>{entry.reason}</p>{entry.decision_note && entry.status !== 'pending' && <p className="due-date-decision-note">Decision: {entry.decision_note}</p>}<small>Submitted {new Date(entry.created_at).toLocaleString()}</small></article>)}
      {request.data && request.data.totalCount > 5 && <div className="committee-picker-pagination"><span>Page {currentPage + 1} of {totalPages} · {request.data.totalCount} requests</span><div><button type="button" className="button outline" disabled={currentPage === 0 || request.isFetching} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentPage + 1 >= totalPages || request.isFetching} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}
      {(!latestRequest || latestRequest.status !== 'pending') && !request.error && !request.isPending && !disabled && <form onSubmit={(event) => void submit(event)}><label>Proposed due date<input type="date" min={minDateValue} value={proposedDate} required onChange={(event) => setProposedDate(event.target.value)} /></label><label>Reason<textarea value={reason} minLength={3} maxLength={2000} required placeholder="Explain why you need more time." onChange={(event) => setReason(event.target.value)} /></label><button className="button outline" disabled={busy || reason.trim().length < 3}>{busy ? 'Submitting…' : 'Send request'}</button></form>}
      {error && <ErrorNotice message={error} />}
    </div>}
  </div>
}

function CommitteeDueDateRequestCard({ request, busy, onDecide }: { request: CommitteeTaskDueDateReview; busy: boolean; onDecide: (requestId: string, decision: 'approved' | 'declined', note: string) => void }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  return <article className="committee-due-request-card">
    <div><span className="status-pill status-pending">Awaiting review</span><h3>{request.task_title}</h3><p>{request.committee_name} · Requested by {request.requester_name}</p></div>
    <div className="committee-due-request-dates"><span>Current: {request.current_due_date ? new Date(`${request.current_due_date}T00:00:00`).toLocaleDateString() : 'No due date'}</span><ChevronRight size={16} /><strong>Proposed: {new Date(`${request.proposed_due_date}T00:00:00`).toLocaleDateString()}</strong></div>
    <p className="committee-due-request-reason">{request.reason}</p>
    <form onSubmit={(event) => { event.preventDefault(); setError(''); onDecide(request.id, 'approved', note) }}><label>Decision note (required when declining)<textarea value={note} maxLength={2000} placeholder="Optional note for approval; explain a decline." onChange={(event) => setNote(event.target.value)} /></label><div><button type="submit" className="button primary" disabled={busy}>Approve date</button><button type="button" className="button outline" disabled={busy} onClick={() => { if (note.trim().length < 3) { setError('Add at least 3 characters explaining why this request is declined.'); return } setError(''); onDecide(request.id, 'declined', note) }}>Decline</button></div></form>
    {error && <ErrorNotice message={error} />}
  </article>
}

function CommitteeDueDateReviewQueue({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [busyRequest, setBusyRequest] = useState('')
  const [error, setError] = useState('')
  const requests = useQuery({ queryKey: ['committee-due-date-review-queue', tenantId, page], queryFn: () => listCommitteeTaskDueDateRequests(tenantId, page) })
  const totalPages = Math.max(1, Math.ceil((requests.data?.totalCount ?? 0) / 20))
  const currentPage = Math.min(page, totalPages - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])
  async function decide(requestId: string, decision: 'approved' | 'declined', note: string) {
    setBusyRequest(requestId); setError('')
    try {
      await decideCommitteeTaskDueDateRequest(requestId, decision, note)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['committee-due-date-review-queue', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-tasks', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-task-notes'] }),
      ])
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to review the due-date request.') }
    finally { setBusyRequest('') }
  }
  return <details className="ops-panel committee-due-date-review-queue" open>
    <summary><div><h2>Due-date requests <span>{requests.data?.totalCount ?? 0}</span></h2><p>Review schedule changes requested by assigned Kagawads.</p></div><History size={18} /></summary>
    {requests.isPending && <LoadingNotice compact />}{requests.error && <ErrorNotice message="Due-date requests could not be loaded." onRetry={() => void requests.refetch()} retrying={requests.isFetching} />}
    {error && <ErrorNotice message={error} />}
    {requests.data?.rows.length === 0 && <p className="field-hint">There are no due-date requests awaiting review.</p>}
    {requests.data?.rows.map((request) => <CommitteeDueDateRequestCard key={request.id} request={request} busy={busyRequest === request.id} onDecide={(id, decision, note) => void decide(id, decision, note)} />)}
    {totalPages > 1 && <div className="committee-picker-pagination"><span>Page {currentPage + 1} of {totalPages} · {requests.data?.totalCount ?? 0} requests</span><div><button type="button" className="button outline" disabled={currentPage === 0 || requests.isFetching} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentPage + 1 >= totalPages || requests.isFetching} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}
  </details>
}

function FocusedCommitteeTask({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const context = useQuery({ queryKey: ['committee-task-notification-context', taskId], queryFn: () => getCommitteeTaskNotificationContext(taskId) })
  const notes = useQuery({ queryKey: ['committee-task-notes', taskId], queryFn: () => listKagawadActionItemNotes(taskId), enabled: Boolean(context.data) })
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = taskNoteSchema.safeParse(draft)
    if (!parsed.success) { setError('Add a message between 3 and 2,000 characters.'); return }
    setBusy(true); setError('')
    try {
      await addCommitteeTaskProgressNote(taskId, parsed.data)
      setDraft('')
      await queryClient.invalidateQueries({ queryKey: ['committee-task-notes', taskId] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add this task update.') }
    finally { setBusy(false) }
  }
  return <section className="ops-panel focused-committee-task" aria-labelledby="focused-committee-task-title">
    <div className="ops-panel-heading"><div><span className="eyebrow">Opened from Community updates</span><h2 id="focused-committee-task-title">Task conversation</h2></div><button type="button" className="button outline" onClick={onClose}>Close</button></div>
    {context.isPending && <LoadingNotice compact />}
    {context.error && <ErrorNotice message="This task could not be opened. It may have been reassigned or your access may have changed." onRetry={() => void context.refetch()} retrying={context.isFetching} />}
    {context.data === null && !context.isPending && !context.error && <p className="field-hint">This task is no longer available to your account.</p>}
    {context.data && <>
      <div className="focused-committee-task-summary"><p>{context.data.committee_name}</p><h3>{context.data.title}</h3>{context.data.description && <p>{context.data.description}</p>}<div><StatusPill status={context.data.status} />{context.data.due_date && <span>Due {new Date(`${context.data.due_date}T00:00:00`).toLocaleDateString()}</span>}</div></div>
      <div className="kagawad-task-notes focused-committee-task-thread">
        <h3>Progress and responses</h3>
        {notes.isPending ? <LoadingNotice compact /> : notes.error ? <ErrorNotice message="Task messages could not be loaded." onRetry={() => void notes.refetch()} retrying={notes.isFetching} /> : notes.data?.length ? <ol>{[...notes.data].reverse().map((note) => <li key={note.id}><p>{note.note}</p><small>{note.author_name} · {new Date(note.created_at).toLocaleString()}</small></li>)}</ol> : <p className="field-hint">No messages have been added to this task.</p>}
        {(context.data.can_add_note || context.data.can_respond) && <form onSubmit={(event) => void submit(event)}><label htmlFor={`focused-task-message-${taskId}`}>{context.data.can_respond ? 'Add a manager response' : 'Add a progress or blocker note'}<textarea id={`focused-task-message-${taskId}`} value={draft} maxLength={2000} minLength={3} required placeholder={context.data.can_respond ? 'Share guidance or a follow-up request.' : 'Share what changed or what is blocking this task.'} onChange={(event) => setDraft(event.target.value)} /></label><button className="button primary" disabled={busy || draft.trim().length < 3}>{busy ? 'Sending…' : context.data.can_respond ? 'Add response' : 'Add progress note'}</button></form>}
        {error && <ErrorNotice message={error} />}
      </div>
    </>}
  </section>
}

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
  const [progressNotesTaskId, setProgressNotesTaskId] = useState('')
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
        {committeeTasks.length ? <ul>{committeeTasks.map((task) => <li key={task.id}><div><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}<small>{task.assigned_to ? `Assigned to ${task.assignee_name || (task.assigned_to === currentUserId ? 'You' : 'Assigned member')}` : 'Unassigned'}{task.due_date ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}` : ''}</small>{canManage && task.assigned_to && <><button type="button" className="text-action kagawad-task-note-toggle" aria-expanded={progressNotesTaskId === task.id} onClick={() => setProgressNotesTaskId((current) => current === task.id ? '' : task.id)}><MessageSquareText size={14} />{progressNotesTaskId === task.id ? 'Hide progress notes' : 'View progress notes'}</button>{progressNotesTaskId === task.id && <CommitteeTaskNotesViewer taskId={task.id} />}</>}</div><div className="committee-task-status"><StatusPill status={task.status} />{(canManage || task.assigned_to === currentUserId) && <select aria-label={`Update status for ${task.title}`} value={task.status} disabled={busy} onChange={(event) => onChangeTask(task, event.target.value as CommitteeTaskRow['status'])}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select>}</div></li>)}</ul> : <p>No action items yet.</p>}
        {taskPages > 1 && <div className="committee-picker-pagination"><span>Page {currentTaskPage + 1} of {taskPages} · {taskTotal} action items</span><div><button type="button" className="button outline" disabled={currentTaskPage === 0 || tasks.isFetching} onClick={() => setTaskPage(currentTaskPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentTaskPage + 1 >= taskPages || tasks.isFetching} onClick={() => setTaskPage(currentTaskPage + 1)}>Next</button></div></div>}
      </>}
      <form className="committee-task-form" onSubmit={onAddTask}><label>Action item<input name="title" placeholder="Prepare a community proposal" maxLength={180} required /></label><label>Details<textarea name="description" maxLength={2000} /></label><div className="committee-task-form-row">{canManage && <label>Assign to<select name="assignedTo" defaultValue=""><option value="">Unassigned</option>{committeeMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.profile?.display_name || 'Assigned member'}</option>)}</select></label>}{!canManage && <input type="hidden" name="assignedTo" value={currentUserId} />}<label>Due date<input type="date" name="dueDate" /></label><button className="button primary" disabled={busy}>Add action item</button></div></form>
    </details>
  </article>
}

export function CommitteesPage({ focusId, onFocusHandled }: { focusId?: string; onFocusHandled?: () => void }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [myTaskPage, setMyTaskPage] = useState(0)
  const [taskAssignmentHistoryPage, setTaskAssignmentHistoryPage] = useState(0)
  const [myTaskStatus, setMyTaskStatus] = useState<'all' | CommitteeTaskRow['status']>('all')
  const [myTaskDueFilter, setMyTaskDueFilter] = useState<'all' | 'due_soon' | 'overdue'>('all')
  const [myTaskSearchInput, setMyTaskSearchInput] = useState('')
  const [myTaskSearch, setMyTaskSearch] = useState('')
  const [taskNotesFor, setTaskNotesFor] = useState('')
  const [taskNoteDraft, setTaskNoteDraft] = useState('')
  const [pendingTaskAction, setPendingTaskAction] = useState<{ taskId: string; status: 'blocked' | 'completed' } | null>(null)
  const [taskActionReason, setTaskActionReason] = useState('')
  const [focusedTaskId, setFocusedTaskId] = useState('')
  const isKagawad = membership?.role?.key === 'kagawad'
  useEffect(() => { setPage(0); setMyTaskPage(0); setTaskAssignmentHistoryPage(0); setMyTaskStatus('all'); setMyTaskDueFilter('all'); setMyTaskSearch(''); setMyTaskSearchInput(''); setTaskNotesFor(''); setTaskNoteDraft('') }, [tenantId])
  useEffect(() => {
    if (!focusId) return
    setFocusedTaskId(focusId)
    onFocusHandled?.()
  }, [focusId, onFocusHandled])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'committee.manage'], queryFn: () => hasPermission(tenantId, 'committee.manage'), enabled: Boolean(tenantId) })
  const committees = useQuery({ queryKey: ['committees', tenantId, page], queryFn: () => listCommittees(tenantId, page), enabled: Boolean(tenantId) })
  const myTasks = useQuery({ queryKey: ['kagawad-my-action-items', tenantId, myTaskPage, myTaskStatus, myTaskDueFilter, myTaskSearch], queryFn: () => listKagawadAssignedActionItems(tenantId, myTaskPage, myTaskStatus, myTaskSearch, myTaskDueFilter), enabled: Boolean(tenantId && isKagawad) })
  const taskAssignmentHistory = useQuery({ queryKey: ['kagawad-task-assignment-history', tenantId, taskAssignmentHistoryPage], queryFn: () => listKagawadTaskAssignmentHistory(tenantId, taskAssignmentHistoryPage), enabled: Boolean(tenantId && isKagawad) })
  const taskNotes = useQuery({ queryKey: ['kagawad-action-item-notes', tenantId, taskNotesFor], queryFn: () => listKagawadActionItemNotes(taskNotesFor), enabled: Boolean(tenantId && taskNotesFor && isKagawad) })
  const myTaskPages = Math.ceil((myTasks.data?.totalCount ?? 0) / 10)
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
      queryClient.invalidateQueries({ queryKey: ['kagawad-my-action-items', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['kagawad-task-assignment-history', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['kagawad-action-item-notes', tenantId, taskNotesFor] }),
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

  async function submitTaskAction(taskId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pendingTaskAction || pendingTaskAction.taskId !== taskId) return
    const parsed = taskNoteSchema.safeParse(taskActionReason)
    if (!parsed.success) { setError(`Add a ${pendingTaskAction.status === 'blocked' ? 'blocker reason' : 'completion summary'} between 3 and 2,000 characters.`); return }
    setBusy(true); setError(''); setMessage('')
    try {
      if (pendingTaskAction.status === 'blocked') await reportKagawadTaskBlocker(taskId, parsed.data)
      else await completeKagawadTask(taskId, parsed.data)
      setPendingTaskAction(null); setTaskActionReason('')
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['kagawad-task-status-history', taskId] }),
        queryClient.invalidateQueries({ queryKey: ['kagawad-action-item-notes', tenantId, taskId] }),
      ])
      setMessage(pendingTaskAction.status === 'blocked' ? 'Task marked blocked and the committee managers have been notified.' : 'Task marked complete and the committee managers have been notified.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update this task.') }
    finally { setBusy(false) }
  }

  async function submitTaskNote(taskId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = taskNoteSchema.safeParse(taskNoteDraft)
    if (!parsed.success) { setError('Add a note between 3 and 2,000 characters.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await addKagawadActionItemNote(taskId, parsed.data)
      setTaskNoteDraft('')
      await queryClient.invalidateQueries({ queryKey: ['kagawad-action-item-notes', tenantId, taskId] })
      setMessage('Progress note added to your task.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add the progress note.') }
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
    {focusedTaskId && <FocusedCommitteeTask taskId={focusedTaskId} onClose={() => setFocusedTaskId('')} />}
    {canManage.data && tenantId && <CommitteeDueDateReviewQueue tenantId={tenantId} />}
    {Boolean(tenantId) && !canManage.isPending && !canManage.error && !canManage.data && <div className="ops-panel archive-access"><UsersRound size={20} /><div><strong>Committee access is assignment-based</strong><p>You will see committees after an authorized administrator assigns you to one.</p></div></div>}
    {isKagawad && <section className="ops-panel kagawad-invited-meetings" aria-labelledby="kagawad-task-assignment-history-title">
      <div className="ops-panel-heading"><div><h2 id="kagawad-task-assignment-history-title">Task assignment history</h2><p>Assignments recorded for you, including completed work and tasks later transferred away.</p></div><History size={19} /></div>
      {taskAssignmentHistory.isPending ? <LoadingNotice compact /> : taskAssignmentHistory.error ? <ErrorNotice message="Your task assignment history could not be loaded." onRetry={() => void taskAssignmentHistory.refetch()} retrying={taskAssignmentHistory.isFetching} /> : taskAssignmentHistory.data?.rows.length ? <>
        <ul className="kagawad-invited-meeting-list">{taskAssignmentHistory.data.rows.map((entry) => <li key={entry.id}>
          <div><strong>{entry.task_title}</strong><small>{entry.committee_name}{entry.due_date ? ` · Due ${new Date(`${entry.due_date}T00:00:00`).toLocaleDateString()}` : ' · No due date'}</small><small>Assigned {new Date(entry.assigned_at).toLocaleString()}</small></div>
          <StatusPill status={entry.task_status} />
        </li>)}</ul>
        {taskAssignmentHistory.data.totalCount > 10 && <div className="committee-picker-pagination"><span>Page {taskAssignmentHistoryPage + 1} of {Math.ceil(taskAssignmentHistory.data.totalCount / 10)} · {taskAssignmentHistory.data.totalCount} assignments</span><div><button type="button" className="button outline" disabled={taskAssignmentHistoryPage === 0 || taskAssignmentHistory.isFetching} onClick={() => setTaskAssignmentHistoryPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={(taskAssignmentHistoryPage + 1) * 10 >= taskAssignmentHistory.data.totalCount || taskAssignmentHistory.isFetching} onClick={() => setTaskAssignmentHistoryPage((current) => current + 1)}>Next</button></div></div>}
      </> : <p className="field-hint">No task assignments have been recorded yet.</p>}
    </section>}
    {isKagawad && <section className="ops-panel kagawad-my-work" aria-labelledby="kagawad-my-work-title">
      <div className="ops-panel-heading"><div><h2 id="kagawad-my-work-title">My assigned action items</h2><p>All active committee tasks assigned to you in one list.</p></div><UsersRound size={19} /></div>
      <form className="kagawad-action-item-filters" onSubmit={(event) => { event.preventDefault(); setMyTaskPage(0); setMyTaskSearch(myTaskSearchInput.trim()) }}>
        <label>Search tasks<input value={myTaskSearchInput} maxLength={100} placeholder="Task or committee" onChange={(event) => setMyTaskSearchInput(event.target.value)} /></label>
        <label>Status<select value={myTaskStatus} onChange={(event) => { setMyTaskPage(0); setMyTaskStatus(event.target.value as typeof myTaskStatus) }}><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select></label>
        <label>Due date<select value={myTaskDueFilter} onChange={(event) => { setMyTaskPage(0); setMyTaskDueFilter(event.target.value as typeof myTaskDueFilter) }}><option value="all">All due dates</option><option value="due_soon">Due in 7 days</option><option value="overdue">Overdue</option></select></label>
        <button className="button outline">Search</button>
      </form>
      {myTasks.isPending && <LoadingNotice compact />}
      {myTasks.error && <ErrorNotice message="Your assigned action items could not be loaded." />}
      {myTasks.data?.totalCount === 0 && <p className="field-hint">No assigned tasks match these filters.</p>}
      {Boolean(myTasks.data?.rows.length) && <ul className="kagawad-my-task-list">{myTasks.data?.rows.map((task) => <li key={task.id}>
        <div><strong>{task.title}</strong><small>{task.committee_name}{task.due_date ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}` : ' · No due date'}</small>{task.description && <p>{task.description}</p>}
          <KagawadTaskStatusHistory taskId={task.id} />
          {task.status !== 'completed' && <KagawadDueDateRequestPanel taskId={task.id} currentDueDate={task.due_date} disabled={pendingTaskAction?.taskId === task.id} />}
          {pendingTaskAction?.taskId === task.id && <form className={`kagawad-task-action-form ${pendingTaskAction.status}`} onSubmit={(event) => void submitTaskAction(task.id, event)}><label htmlFor={`task-action-${task.id}`}>{pendingTaskAction.status === 'blocked' ? 'Why is this task blocked?' : 'What was completed?'}<textarea id={`task-action-${task.id}`} value={taskActionReason} minLength={3} maxLength={2000} required autoFocus placeholder={pendingTaskAction.status === 'blocked' ? 'Describe what is preventing progress and what support is needed.' : 'Summarize the work completed and any useful handoff details.'} onChange={(event) => setTaskActionReason(event.target.value)} /></label><div><button className="button primary" disabled={busy || taskActionReason.trim().length < 3}>{busy ? 'Sending…' : pendingTaskAction.status === 'blocked' ? 'Report blocker' : 'Complete task'}</button><button type="button" className="button outline" disabled={busy} onClick={() => { setPendingTaskAction(null); setTaskActionReason('') }}>Cancel</button></div></form>}
          <button type="button" className="text-action kagawad-task-note-toggle" aria-expanded={taskNotesFor === task.id} onClick={() => { setTaskNotesFor((current) => current === task.id ? '' : task.id); setTaskNoteDraft('') }}><MessageSquareText size={14} />{taskNotesFor === task.id ? 'Hide progress notes' : 'Progress notes'}</button>
          {taskNotesFor === task.id && <div className="kagawad-task-notes">
            {taskNotes.isPending ? <LoadingNotice compact /> : taskNotes.error ? <ErrorNotice message="Progress notes could not be loaded." onRetry={() => void taskNotes.refetch()} retrying={taskNotes.isFetching} /> : taskNotes.data?.length ? <ol>{taskNotes.data.map((note) => <li key={note.id}><p>{note.note}</p><small>{note.author_name} · {new Date(note.created_at).toLocaleString()}</small></li>)}</ol> : <p className="field-hint">No progress notes yet.</p>}
            <form onSubmit={(event) => void submitTaskNote(task.id, event)}><label htmlFor={`task-note-${task.id}`}>Add a progress or blocker note<textarea id={`task-note-${task.id}`} value={taskNoteDraft} maxLength={2000} minLength={3} required placeholder="Share what changed or what is blocking this task." onChange={(event) => setTaskNoteDraft(event.target.value)} /></label><button className="button outline" disabled={busy || taskNoteDraft.trim().length < 3}>Add note</button></form>
          </div>}
        </div>
        <div className="committee-task-status"><StatusPill status={task.status} /><select aria-label={`Update status for ${task.title}`} value={task.status} disabled={busy} onChange={(event) => { const nextStatus = event.target.value as CommitteeTaskRow['status']; if ((nextStatus === 'blocked' || nextStatus === 'completed') && task.status !== nextStatus) { setPendingTaskAction({ taskId: task.id, status: nextStatus }); setTaskActionReason('') } else void changeStatus(task, nextStatus) }}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select></div>
      </li>)}</ul>}
      {myTaskPages > 1 && <div className="committee-picker-pagination"><span>Page {myTaskPage + 1} of {myTaskPages} · {myTasks.data?.totalCount ?? 0} tasks</span><div><button type="button" className="button outline" disabled={myTaskPage === 0 || myTasks.isFetching} onClick={() => setMyTaskPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={myTaskPage + 1 >= myTaskPages || myTasks.isFetching} onClick={() => setMyTaskPage((current) => current + 1)}>Next</button></div></div>}
    </section>}
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
