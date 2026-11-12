import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, Download, History, MessageSquareText, UsersRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { addCommitteeTaskProgressNote, addKagawadActionItemNote, assignCommitteeMember, completeKagawadTask, COMMITTEE_CONTENT_PAGE_SIZE, COMMITTEE_MEMBER_PAGE_SIZE, COMMITTEE_PAGE_SIZE, createCommittee, createCommitteeTask, decideCommitteeTaskDueDateRequest, getCommitteeTaskNotificationContext, listActiveCommitteeMembers, listAssignableCommitteeMembers, listCommitteeMembers, listCommittees, listCommitteeTasks, listCommitteeTaskDueDateRequestHistory, listCommitteeTaskDueDateRequests, listCommitteeTaskDueDateRequestsForTask, listKagawadActionItemNotes, listKagawadAssignedActionItems, listKagawadCompletedWork, listKagawadTaskAssignmentHistory, listKagawadTaskDueDateRequestHistory, listKagawadTaskStatusHistory, reassignCommitteeTask, requestCommitteeTaskDueDate, reportKagawadTaskBlocker, searchKagawadDueDateRequestHistory, updateCommitteeTaskStatus, withdrawCommitteeTaskDueDateRequest, type CommitteeTaskDueDateReview, type CommitteeTaskRow } from './committee-data'
import { hasPermission } from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { encodeCsv } from './csv'
import { formatDateTime, formatManilaDate } from './format'

const committeeSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000) })
const taskSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), assignedTo: z.string(), dueDate: z.string() })
const taskNoteSchema = z.string().trim().min(3).max(2000)
const dateInputValue = (value: string | number | Date) => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const part = (type: 'year' | 'month' | 'day') => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
const manilaDateOffset = (days: number) => dateInputValue(Date.now() + days * 24 * 60 * 60 * 1000)

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
      {history.isPending ? <LoadingNotice compact /> : history.error ? <ErrorNotice message="Task status history could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} /> : history.data?.rows.length ? <ol>{history.data.rows.map((entry) => <li key={entry.id}><strong>{entry.details}</strong><small>{entry.actor_name} · {formatDateTime(entry.created_at)}</small></li>)}</ol> : <p className="field-hint">No status changes have been recorded yet.</p>}
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
    {notes.isPending ? <LoadingNotice compact /> : notes.error ? <ErrorNotice message="Task progress notes could not be loaded." onRetry={() => void notes.refetch()} retrying={notes.isFetching} /> : notes.data?.length ? <ol>{notes.data.map((note) => <li key={note.id}><p>{note.note}</p><small>{note.author_name} · {formatDateTime(note.created_at)}</small></li>)}</ol> : <p className="field-hint">No progress notes have been added.</p>}
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
  const minDateValue = manilaDateOffset(1)
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
  async function withdraw(requestId: string) {
    if (!window.confirm('Withdraw this pending due-date request?')) return
    setBusy(true); setError('')
    try {
      await withdrawCommitteeTaskDueDateRequest(requestId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['kagawad-task-due-date-request-history', taskId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-due-date-review-queue'] }),
      ])
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to withdraw the due-date request.') }
    finally { setBusy(false) }
  }
  return <div className="kagawad-due-date-request">
    <button type="button" className="text-action kagawad-task-note-toggle" aria-expanded={open} disabled={disabled} onClick={() => setOpen((value) => !value)}>{open ? 'Close due-date request' : 'Request due-date change'}</button>
    {open && <div className="kagawad-due-date-request-content">
      {request.isPending && <LoadingNotice compact />}
      {request.error && <ErrorNotice message="Your due-date request could not be loaded." onRetry={() => void request.refetch()} retrying={request.isFetching} />}
      {request.data?.rows.map((entry) => <article key={entry.id} className={`due-date-request-status ${entry.status}`}><strong>{entry.status === 'pending' ? 'Awaiting manager review' : entry.status === 'approved' ? 'Approved' : entry.status === 'withdrawn' ? 'Withdrawn by you' : 'Declined'}</strong><span>{entry.current_due_date ? `Requested ${formatManilaDate(entry.current_due_date)} → ${formatManilaDate(entry.proposed_due_date)}` : `Proposed date: ${formatManilaDate(entry.proposed_due_date)}`}</span><p>{entry.reason}</p>{entry.decision_note && entry.status !== 'pending' && <p className="due-date-decision-note">{entry.status === 'withdrawn' ? 'Note: ' : 'Decision: '}{entry.decision_note}</p>}<small>Submitted {formatDateTime(entry.created_at)}</small>{entry.reviewed_at && <small>{entry.status === 'withdrawn' ? 'Withdrawn by' : 'Reviewed by'} {entry.reviewer_name ?? 'a committee member'} · {formatDateTime(entry.reviewed_at)}</small>}{entry.id === latestRequest?.id && entry.status === 'pending' && !disabled && <button type="button" className="button outline due-date-request-withdraw" disabled={busy} onClick={() => void withdraw(entry.id)}>{busy ? 'Withdrawing…' : 'Withdraw request'}</button>}</article>)}
      {request.data && request.data.totalCount > 5 && <div className="committee-picker-pagination"><span>Page {currentPage + 1} of {totalPages} · {request.data.totalCount} requests</span><div><button type="button" className="button outline" disabled={currentPage === 0 || request.isFetching} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentPage + 1 >= totalPages || request.isFetching} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}
      {(!latestRequest || latestRequest.status !== 'pending') && !request.error && !request.isPending && !disabled && <form onSubmit={(event) => void submit(event)}><label>Proposed due date<input type="date" min={minDateValue} value={proposedDate} required onChange={(event) => setProposedDate(event.target.value)} /></label><label>Reason<textarea value={reason} minLength={3} maxLength={2000} required placeholder="Explain why you need more time." onChange={(event) => setReason(event.target.value)} /></label><button className="button outline" disabled={busy || reason.trim().length < 3}>{busy ? 'Submitting…' : 'Send request'}</button></form>}
      {error && <ErrorNotice message={error} />}
    </div>}
  </div>
}

function CommitteeDueDateRequestCard({ request, busy, onDecide }: { request: CommitteeTaskDueDateReview; busy: boolean; onDecide: (requestId: string, decision: 'approved' | 'declined', note: string) => void }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const completed = request.task_status === 'completed'
  return <article className="committee-due-request-card">
    <div><span className="status-pill status-pending">Awaiting review</span><h3>{request.task_title}</h3><p>{request.committee_name} · Requested by {request.requester_name}</p></div>
    <p>Task status: <strong>{request.task_status.replaceAll('_', ' ')}</strong></p>
    <small>Submitted {formatDateTime(request.created_at)}</small>
    {completed && <p className="field-hint">This task is completed. Its due date cannot be changed; decline the request with a reason.</p>}
    <div className="committee-due-request-dates"><span>Current: {request.current_due_date ? formatManilaDate(request.current_due_date) : 'No due date'}</span><ChevronRight size={16} /><strong>Proposed: {formatManilaDate(request.proposed_due_date)}</strong></div>
    <p className="committee-due-request-reason">{request.reason}</p>
    <form onSubmit={(event) => { event.preventDefault(); setError(''); onDecide(request.id, 'approved', note) }}><label>Decision note (required when declining)<textarea value={note} maxLength={2000} placeholder="Optional note for approval; explain a decline." onChange={(event) => setNote(event.target.value)} /></label><div><button type="submit" className="button primary" disabled={busy || completed}>Approve date</button><button type="button" className="button outline" disabled={busy} onClick={() => { if (note.trim().length < 3) { setError('Add at least 3 characters explaining why this request is declined.'); return } setError(''); onDecide(request.id, 'declined', note) }}>Decline</button></div></form>
    {error && <ErrorNotice message={error} />}
  </article>
}

function CommitteeDueDateReviewQueue({ tenantId, focused = false, onFocusHandled }: { tenantId: string; focused?: boolean; onFocusHandled?: () => void }) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [busyRequest, setBusyRequest] = useState('')
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ search: '', createdAfter: '', createdBefore: '' })
  const [filterDraft, setFilterDraft] = useState({ search: '', createdAfter: '', createdBefore: '' })
  const [filterError, setFilterError] = useState('')
  const requests = useQuery({ queryKey: ['committee-due-date-review-queue', tenantId, page, filters], queryFn: () => listCommitteeTaskDueDateRequests(tenantId, page, filters) })
  const totalPages = Math.max(1, Math.ceil((requests.data?.totalCount ?? 0) / 20))
  const currentPage = Math.min(page, totalPages - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])
  useEffect(() => {
    if (!focused) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('committee-due-date-review-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      onFocusHandled?.()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focused, onFocusHandled])
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (filterDraft.createdAfter && filterDraft.createdBefore && filterDraft.createdAfter > filterDraft.createdBefore) {
      setFilterError('The start date must be on or before the end date.')
      return
    }
    setFilterError('')
    setPage(0)
    setFilters({ ...filterDraft, search: filterDraft.search.trim() })
  }
  function clearFilters() {
    const empty = { search: '', createdAfter: '', createdBefore: '' }
    setFilters(empty); setFilterDraft(empty); setFilterError(''); setPage(0)
  }
  async function decide(requestId: string, decision: 'approved' | 'declined', note: string) {
    setBusyRequest(requestId); setError('')
    try {
      await decideCommitteeTaskDueDateRequest(requestId, decision, note)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['committee-due-date-review-queue', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-due-date-review-history', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-task-due-date-review-for-task', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-tasks', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-task-notes'] }),
      ])
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to review the due-date request.') }
    finally { setBusyRequest('') }
  }
  return <details id="committee-due-date-review-queue" className="ops-panel committee-due-date-review-queue" open>
    <summary><div><h2>Due-date requests <span>{requests.data?.totalCount ?? 0}</span></h2><p>Review schedule changes requested by assigned Kagawads.</p></div><History size={18} /></summary>
    <form className="committee-due-date-filters" onSubmit={applyFilters}>
      <label>Search requests<input type="search" maxLength={100} placeholder="Task, committee, requester, or reason" value={filterDraft.search} onChange={(event) => setFilterDraft((current) => ({ ...current, search: event.target.value }))} /></label>
      <label>Submitted on or after<input type="date" max={filterDraft.createdBefore || undefined} value={filterDraft.createdAfter} onChange={(event) => setFilterDraft((current) => ({ ...current, createdAfter: event.target.value }))} /></label>
      <label>Submitted on or before<input type="date" min={filterDraft.createdAfter || undefined} value={filterDraft.createdBefore} onChange={(event) => setFilterDraft((current) => ({ ...current, createdBefore: event.target.value }))} /></label>
      <div><button className="button primary" type="submit">Apply</button><button className="button outline" type="button" onClick={clearFilters} disabled={!filterDraft.search && !filterDraft.createdAfter && !filterDraft.createdBefore}>Clear</button></div>
    </form>
    {filterError && <p className="field-hint" role="alert">{filterError}</p>}
    {requests.isPending && <LoadingNotice compact />}{requests.error && <ErrorNotice message="Due-date requests could not be loaded." onRetry={() => void requests.refetch()} retrying={requests.isFetching} />}
    {error && <ErrorNotice message={error} />}
    {requests.data?.rows.length === 0 && <p className="field-hint">{filters.search || filters.createdAfter || filters.createdBefore ? 'No due-date requests match these filters.' : 'There are no due-date requests awaiting review.'}</p>}
    {requests.data?.rows.map((request) => <CommitteeDueDateRequestCard key={request.id} request={request} busy={busyRequest === request.id} onDecide={(id, decision, note) => void decide(id, decision, note)} />)}
    {totalPages > 1 && <div className="committee-picker-pagination"><span>Page {currentPage + 1} of {totalPages} · {requests.data?.totalCount ?? 0} requests</span><div><button type="button" className="button outline" disabled={currentPage === 0 || requests.isFetching} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentPage + 1 >= totalPages || requests.isFetching} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}
  </details>
}

function CommitteeDueDateRequestHistory({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({ status: 'all', search: '', createdAfter: '', createdBefore: '', reviewedAfter: '', reviewedBefore: '' })
  const [draft, setDraft] = useState({ status: 'all', search: '', createdAfter: '', createdBefore: '', reviewedAfter: '', reviewedBefore: '' })
  const [filterError, setFilterError] = useState('')
  const history = useQuery({
    queryKey: ['committee-due-date-review-history', tenantId, page, filters],
    queryFn: () => listCommitteeTaskDueDateRequestHistory(tenantId, page, filters),
    enabled: Boolean(open && tenantId),
  })
  const totalPages = Math.max(1, Math.ceil((history.data?.totalCount ?? 0) / 20))
  const currentPage = Math.min(page, totalPages - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.createdAfter && draft.createdBefore && draft.createdAfter > draft.createdBefore) {
      setFilterError('The submission start date must be on or before the end date.')
      return
    }
    if (draft.reviewedAfter && draft.reviewedBefore && draft.reviewedAfter > draft.reviewedBefore) {
      setFilterError('The review start date must be on or before the end date.')
      return
    }
    setFilterError(''); setPage(0); setFilters({ ...draft, search: draft.search.trim() })
  }
  function clearFilters() {
    const empty = { status: 'all', search: '', createdAfter: '', createdBefore: '', reviewedAfter: '', reviewedBefore: '' }
    setFilters(empty); setDraft(empty); setFilterError(''); setPage(0)
  }
  return <details className="ops-panel committee-due-date-history" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><div><h2>Reviewed due-date requests <span>{history.data?.totalCount ?? '—'}</span></h2><p>Find approved, declined, or withdrawn requests.</p></div><History size={18} /></summary>
    <form className="committee-due-date-filters" onSubmit={applyFilters}>
      <label>Search history<input type="search" maxLength={100} placeholder="Task, requester, or decision" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} /></label>
      <label>Outcome<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}><option value="all">All outcomes</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="withdrawn">Withdrawn</option></select></label>
      <label>Submitted on or after<input type="date" max={draft.createdBefore || undefined} value={draft.createdAfter} onChange={(event) => setDraft((current) => ({ ...current, createdAfter: event.target.value }))} /></label>
      <label>Submitted on or before<input type="date" min={draft.createdAfter || undefined} value={draft.createdBefore} onChange={(event) => setDraft((current) => ({ ...current, createdBefore: event.target.value }))} /></label>
      <label>Reviewed on or after<input type="date" max={draft.reviewedBefore || undefined} value={draft.reviewedAfter} onChange={(event) => setDraft((current) => ({ ...current, reviewedAfter: event.target.value }))} /></label>
      <label>Reviewed on or before<input type="date" min={draft.reviewedAfter || undefined} value={draft.reviewedBefore} onChange={(event) => setDraft((current) => ({ ...current, reviewedBefore: event.target.value }))} /></label>
      <div><button className="button primary" type="submit">Apply</button><button className="button outline" type="button" onClick={clearFilters} disabled={!draft.search && draft.status === 'all' && !draft.createdAfter && !draft.createdBefore && !draft.reviewedAfter && !draft.reviewedBefore}>Clear</button></div>
    </form>
    {filterError && <p className="field-hint" role="alert">{filterError}</p>}
    {history.isPending && open && <LoadingNotice compact />}
    {history.error && <ErrorNotice message="Reviewed due-date requests could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} />}
    {history.data?.rows.length === 0 && <p className="field-hint">{filters.search || filters.status !== 'all' || filters.createdAfter || filters.createdBefore || filters.reviewedAfter || filters.reviewedBefore ? 'No reviewed requests match these filters.' : 'No due-date requests have been reviewed yet.'}</p>}
    {history.data?.rows.length ? <ul className="committee-due-date-history-list">{history.data.rows.map((entry) => <li key={entry.id}>
      <div><span className={`committee-due-history-status ${entry.status}`}>{entry.status.replaceAll('_', ' ')}</span><strong>{entry.task_title}</strong><small>{entry.committee_name} · Requested by {entry.requester_name}</small></div>
      <p>{entry.current_due_date ? `Requested ${formatManilaDate(entry.current_due_date)} → ${formatManilaDate(entry.proposed_due_date)}` : `Proposed ${formatManilaDate(entry.proposed_due_date)}`}</p>
      <p className="committee-due-request-reason">{entry.reason}</p>
      <small>{entry.status === 'withdrawn' ? 'Withdrawn by' : 'Reviewed by'} {entry.reviewer_name} · {entry.reviewed_at ? formatDateTime(entry.reviewed_at) : 'Review time unavailable'}</small>
      {entry.decision_note && <p className="due-date-decision-note">{entry.decision_note}</p>}
    </li>)}</ul> : null}
    {history.data && totalPages > 1 && <div className="committee-picker-pagination"><span>Page {currentPage + 1} of {totalPages} · {history.data.totalCount} requests</span><div><button type="button" className="button outline" disabled={currentPage === 0 || history.isFetching} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentPage + 1 >= totalPages || history.isFetching} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}
  </details>
}

function FocusedCommitteeTask({ tenantId, taskId, onClose }: { tenantId: string; taskId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [decisionMessage, setDecisionMessage] = useState('')
  const [decisionError, setDecisionError] = useState('')
  const [dueDatePage, setDueDatePage] = useState(0)
  const context = useQuery({ queryKey: ['committee-task-notification-context', taskId], queryFn: () => getCommitteeTaskNotificationContext(taskId) })
  const canViewTaskConversation = Boolean(context.data?.can_add_note || context.data?.can_respond)
  const notes = useQuery({ queryKey: ['committee-task-notes', taskId], queryFn: () => listKagawadActionItemNotes(taskId), enabled: canViewTaskConversation })
  const dueDateReviewRequests = useQuery({
    queryKey: ['committee-task-due-date-review-for-task', tenantId, taskId],
    queryFn: () => listCommitteeTaskDueDateRequestsForTask(tenantId, taskId),
    enabled: Boolean(context.data?.can_respond),
  })
  const dueDateRequests = useQuery({
    queryKey: ['kagawad-task-due-date-request-history', taskId, dueDatePage],
    queryFn: () => listKagawadTaskDueDateRequestHistory(taskId, dueDatePage),
    enabled: Boolean(context.data?.can_view_due_date_history),
  })
  const dueDatePages = Math.max(1, Math.ceil((dueDateRequests.data?.totalCount ?? 0) / 5))
  const currentDueDatePage = Math.min(dueDatePage, dueDatePages - 1)
  useEffect(() => { setDueDatePage(0) }, [taskId])
  useEffect(() => { if (dueDatePage !== currentDueDatePage) setDueDatePage(currentDueDatePage) }, [currentDueDatePage, dueDatePage])
  async function decideDueDateRequest(requestId: string, decision: 'approved' | 'declined', note: string) {
    setBusy(true); setDecisionError(''); setDecisionMessage('')
    try {
      await decideCommitteeTaskDueDateRequest(requestId, decision, note)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['committee-task-due-date-review-for-task', tenantId, taskId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-due-date-review-queue', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-due-date-review-history', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-tasks', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['committee-task-notes', taskId] }),
      ])
      setDecisionMessage(decision === 'approved' ? 'Due-date change approved and saved.' : 'Due-date request declined and saved.')
    } catch (err) { setDecisionError(err instanceof Error ? err.message : 'Unable to review the due-date request.') }
    finally { setBusy(false) }
  }
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
    <div className="ops-panel-heading"><div><span className="eyebrow">Opened from Community updates</span><h2 id="focused-committee-task-title">{context.data?.can_view_due_date_history && !canViewTaskConversation ? 'Due-date request decision' : 'Task conversation'}</h2></div><button type="button" className="button outline" onClick={onClose}>Close</button></div>
    {context.isPending && <LoadingNotice compact />}
    {context.error && <ErrorNotice message="This task could not be opened. It may have been reassigned or your access may have changed." onRetry={() => void context.refetch()} retrying={context.isFetching} />}
    {context.data === null && !context.isPending && !context.error && <p className="field-hint">This task is no longer available to your account.</p>}
    {context.data && <>
      <div className="focused-committee-task-summary"><p>{context.data.committee_name}</p><h3>{context.data.title}</h3>{context.data.description && canViewTaskConversation && <p>{context.data.description}</p>}<div><StatusPill status={context.data.status} />{context.data.due_date && <span>Due {formatManilaDate(context.data.due_date)}</span>}</div></div>
      {context.data.can_view_due_date_history && <section className="focused-task-due-date-history" aria-labelledby={`focused-task-due-date-title-${taskId}`}>
        <h3 id={`focused-task-due-date-title-${taskId}`}>Your due-date requests</h3>
        {dueDateRequests.isPending ? <LoadingNotice compact /> : dueDateRequests.error ? <ErrorNotice message="Due-date request history could not be loaded." onRetry={() => void dueDateRequests.refetch()} retrying={dueDateRequests.isFetching} /> : dueDateRequests.data?.rows.length ? <>
          <ol>{dueDateRequests.data.rows.map((entry) => <li key={entry.id} className={`due-date-request-status ${entry.status}`}>
            <strong>{entry.status === 'pending' ? 'Awaiting manager review' : entry.status === 'approved' ? 'Approved' : entry.status === 'withdrawn' ? 'Withdrawn by you' : 'Declined'}</strong>
            <span>{entry.current_due_date ? `Requested ${formatManilaDate(entry.current_due_date)} → ${formatManilaDate(entry.proposed_due_date)}` : `Proposed date: ${formatManilaDate(entry.proposed_due_date)}`}</span>
            <p>{entry.reason}</p>
            {entry.decision_note && <p className="due-date-decision-note">{entry.status === 'withdrawn' ? 'Note: ' : 'Decision: '}{entry.decision_note}</p>}
            <small>Submitted {formatDateTime(entry.created_at)}</small>
            {entry.reviewed_at && <small>{entry.status === 'withdrawn' ? 'Withdrawn by' : 'Reviewed by'} {entry.reviewer_name ?? 'a committee member'} · {formatDateTime(entry.reviewed_at)}</small>}
          </li>)}</ol>
          {dueDateRequests.data.totalCount > 5 && <div className="committee-picker-pagination"><span>Page {currentDueDatePage + 1} of {dueDatePages} · {dueDateRequests.data.totalCount} requests</span><div><button type="button" className="button outline" disabled={currentDueDatePage === 0 || dueDateRequests.isFetching} onClick={() => setDueDatePage(currentDueDatePage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentDueDatePage + 1 >= dueDatePages || dueDateRequests.isFetching} onClick={() => setDueDatePage(currentDueDatePage + 1)}>Next</button></div></div>}
        </> : <p className="field-hint">You have not requested a due-date change for this task.</p>}
      </section>}
      {context.data.can_respond && <section className="focused-task-due-date-review" aria-labelledby={`focused-task-due-date-review-title-${taskId}`}>
        <h3 id={`focused-task-due-date-review-title-${taskId}`}>Due-date requests awaiting your review</h3>
        {decisionMessage && <div className="ops-success" role="status">{decisionMessage}</div>}
        {decisionError && <ErrorNotice message={decisionError} />}
        {dueDateReviewRequests.isPending ? <LoadingNotice compact /> : dueDateReviewRequests.error ? <ErrorNotice message="Due-date requests for this task could not be loaded." onRetry={() => void dueDateReviewRequests.refetch()} retrying={dueDateReviewRequests.isFetching} /> : dueDateReviewRequests.data?.rows.length ? dueDateReviewRequests.data.rows.map((request) => <CommitteeDueDateRequestCard key={request.id} request={request} busy={busy} onDecide={(id, decision, note) => void decideDueDateRequest(id, decision, note)} />) : <p className="field-hint">No due-date requests are awaiting review for this task.</p>}
      </section>}
      {canViewTaskConversation && <div className="kagawad-task-notes focused-committee-task-thread">
        <h3>Progress and responses</h3>
        {notes.isPending ? <LoadingNotice compact /> : notes.error ? <ErrorNotice message="Task messages could not be loaded." onRetry={() => void notes.refetch()} retrying={notes.isFetching} /> : notes.data?.length ? <ol>{[...notes.data].reverse().map((note) => <li key={note.id}><p>{note.note}</p><small>{note.author_name} · {formatDateTime(note.created_at)}</small></li>)}</ol> : <p className="field-hint">No messages have been added to this task.</p>}
        {(context.data.can_add_note || context.data.can_respond) && <form onSubmit={(event) => void submit(event)}><label htmlFor={`focused-task-message-${taskId}`}>{context.data.can_respond ? 'Add a manager response' : 'Add a progress or blocker note'}<textarea id={`focused-task-message-${taskId}`} value={draft} maxLength={2000} minLength={3} required placeholder={context.data.can_respond ? 'Share guidance or a follow-up request.' : 'Share what changed or what is blocking this task.'} onChange={(event) => setDraft(event.target.value)} /></label><button className="button primary" disabled={busy || draft.trim().length < 3}>{busy ? 'Sending…' : context.data.can_respond ? 'Add response' : 'Add progress note'}</button></form>}
        {error && <ErrorNotice message={error} />}
      </div>}
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
      {candidates.error && <ErrorNotice message="Unable to load active members." onRetry={() => void candidates.refetch()} retrying={candidates.isFetching} />}
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

function CommitteeTaskAssigneeEditor({ tenantId, committeeId, task, busy, onReassign }: {
  tenantId: string; committeeId: string; task: CommitteeTaskRow; busy: boolean
  onReassign: (taskId: string, userId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [assigneeId, setAssigneeId] = useState(task.assigned_to ?? '')
  const candidates = useQuery({
    queryKey: ['committee-active-member-picker', tenantId, committeeId, page, search],
    queryFn: () => listActiveCommitteeMembers(tenantId, committeeId, page, search), enabled: open,
  })
  useEffect(() => { setAssigneeId(task.assigned_to ?? '') }, [task.assigned_to])
  const pages = Math.max(1, Math.ceil((candidates.data?.totalCount ?? 0) / COMMITTEE_MEMBER_PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])
  const currentAssignee = task.assigned_to && !candidates.data?.rows.some((member) => member.user_id === task.assigned_to)
    ? <option value={task.assigned_to}>{task.assignee_name || 'Current assignee'} (current)</option>
    : null

  return <details className="committee-task-reassign" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Change assignee</summary>
    {open && <>
      <form className="committee-member-search" onSubmit={(event) => { event.preventDefault(); setPage(0); setSearch(searchInput.trim()) }}>
        <label>Find an active committee member<input aria-label={`Search assignees for ${task.title}`} maxLength={100} placeholder="Name or role" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
        <button className="button outline" type="submit">Search</button>
      </form>
      {candidates.isPending && <p className="field-hint" role="status">Loading active members…</p>}
      {candidates.error && <ErrorNotice message="Active committee members could not be loaded." onRetry={() => void candidates.refetch()} retrying={candidates.isFetching} />}
      {candidates.data && <>
        {candidates.data.totalCount ? <>
          <label className="committee-task-assignee-label">New assignee<select aria-label={`New assignee for ${task.title}`} value={assigneeId} disabled={busy || candidates.isFetching} onChange={(event) => setAssigneeId(event.target.value)}>
            <option value="" disabled>Select an active member</option>{currentAssignee}{candidates.data.rows.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name} · {member.role_label}</option>)}
          </select></label>
          <button type="button" className="button outline" disabled={busy || !assigneeId || assigneeId === task.assigned_to} onClick={() => onReassign(task.id, assigneeId)}>{busy ? 'Saving…' : 'Save assignee'}</button>
          <div className="committee-picker-pagination"><span>Page {currentPage + 1} of {pages} · {candidates.data.totalCount} active members</span><div><button type="button" className="button outline" disabled={currentPage === 0 || candidates.isFetching} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentPage + 1 >= pages || candidates.isFetching} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
        </> : <p className="field-hint">No active members are assigned to this committee.</p>}
      </>}
    </>}
  </details>
}

function CommitteeWorkspaceCard({
  tenantId, committee, canManage, currentUserId, busy, onAssign, onAddTask, onChangeTask, onReassignTask,
}: {
  tenantId: string
  committee: { id: string; name: string; description: string }
  canManage: boolean
  currentUserId: string
  busy: boolean
  onAssign: (event: FormEvent<HTMLFormElement>) => void
  onAddTask: (event: FormEvent<HTMLFormElement>) => void
  onChangeTask: (task: CommitteeTaskRow, status: CommitteeTaskRow['status']) => void
  onReassignTask: (taskId: string, userId: string) => void
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
      {membersOpen && members.error && <ErrorNotice message="Unable to load committee members." onRetry={() => void members.refetch()} retrying={members.isFetching} />}
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
      {tasksOpen && tasks.error && <ErrorNotice message="Unable to load committee action items." onRetry={() => void tasks.refetch()} retrying={tasks.isFetching} />}
      {tasksOpen && tasks.data && <>
        {committeeTasks.length ? <ul>{committeeTasks.map((task) => <li key={task.id}><div><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}<small>{task.assigned_to ? `Assigned to ${task.assignee_name || (task.assigned_to === currentUserId ? 'You' : 'Assigned member')}` : 'Unassigned'}{task.due_date ? ` · Due ${formatManilaDate(task.due_date)}` : ''}</small>{canManage && task.status !== 'completed' && <CommitteeTaskAssigneeEditor tenantId={tenantId} committeeId={committee.id} task={task} busy={busy} onReassign={onReassignTask} />}{canManage && task.assigned_to && <><button type="button" className="text-action kagawad-task-note-toggle" aria-expanded={progressNotesTaskId === task.id} onClick={() => setProgressNotesTaskId((current) => current === task.id ? '' : task.id)}><MessageSquareText size={14} />{progressNotesTaskId === task.id ? 'Hide progress notes' : 'View progress notes'}</button>{progressNotesTaskId === task.id && <CommitteeTaskNotesViewer taskId={task.id} />}</>}</div><div className="committee-task-status"><StatusPill status={task.status} />{(canManage || task.assigned_to === currentUserId) && <select aria-label={`Update status for ${task.title}`} value={task.status} disabled={busy} onChange={(event) => onChangeTask(task, event.target.value as CommitteeTaskRow['status'])}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select>}</div></li>)}</ul> : <p>No action items yet.</p>}
        {taskPages > 1 && <div className="committee-picker-pagination"><span>Page {currentTaskPage + 1} of {taskPages} · {taskTotal} action items</span><div><button type="button" className="button outline" disabled={currentTaskPage === 0 || tasks.isFetching} onClick={() => setTaskPage(currentTaskPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentTaskPage + 1 >= taskPages || tasks.isFetching} onClick={() => setTaskPage(currentTaskPage + 1)}>Next</button></div></div>}
      </>}
      <form className="committee-task-form" onSubmit={onAddTask}><label>Action item<input name="title" placeholder="Prepare a community proposal" maxLength={180} required /></label><label>Details<textarea name="description" maxLength={2000} /></label><div className="committee-task-form-row">{canManage && <label>Assign to<select name="assignedTo" defaultValue=""><option value="">Unassigned</option>{committeeMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.profile?.display_name || 'Assigned member'}</option>)}</select></label>}{!canManage && <input type="hidden" name="assignedTo" value={currentUserId} />}<label>Due date<input type="date" name="dueDate" /></label><button className="button primary" disabled={busy}>Add action item</button></div></form>
    </details>
  </article>
}

export function CommitteesPage({ focusId, focusDueDateRequestStatus, focusDueDateReviewQueue, focusTaskFilter, onFocusHandled }: { focusId?: string; focusDueDateRequestStatus?: 'pending' | 'reviewed'; focusDueDateReviewQueue?: boolean; focusTaskFilter?: 'open' | 'in_progress' | 'blocked' | 'overdue' | 'due_soon' | 'completed_work'; onFocusHandled?: () => void }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [myTaskPage, setMyTaskPage] = useState(0)
  const [taskAssignmentHistoryPage, setTaskAssignmentHistoryPage] = useState(0)
  const [completedWorkPage, setCompletedWorkPage] = useState(0)
  const [exportingCompletedWork, setExportingCompletedWork] = useState(false)
  const [completedWorkExportMessage, setCompletedWorkExportMessage] = useState('')
  const [dueDateHistoryPage, setDueDateHistoryPage] = useState(0)
  const [dueDateHistoryFilters, setDueDateHistoryFilters] = useState({ status: 'all', search: '', createdAfter: '', createdBefore: '', reviewedAfter: '', reviewedBefore: '' })
  const [dueDateHistoryDraft, setDueDateHistoryDraft] = useState({ status: 'all', search: '', createdAfter: '', createdBefore: '', reviewedAfter: '', reviewedBefore: '' })
  const [dueDateHistoryFilterError, setDueDateHistoryFilterError] = useState('')
  const [exportingDueDateHistory, setExportingDueDateHistory] = useState(false)
  const [dueDateHistoryExportMessage, setDueDateHistoryExportMessage] = useState('')
  const [completedWorkFilters, setCompletedWorkFilters] = useState({ search: '', completedAfter: '', completedBefore: '' })
  const [completedWorkDraft, setCompletedWorkDraft] = useState({ search: '', completedAfter: '', completedBefore: '' })
  const [taskHistoryDraft, setTaskHistoryDraft] = useState({ search: '', status: 'all', assignedAfter: '', assignedBefore: '' })
  const [taskHistoryFilters, setTaskHistoryFilters] = useState({ search: '', status: 'all', assignedAfter: '', assignedBefore: '' })
  const [exportingTaskHistory, setExportingTaskHistory] = useState(false)
  const [taskHistoryExportMessage, setTaskHistoryExportMessage] = useState('')
  const [myTaskStatus, setMyTaskStatus] = useState<'all' | CommitteeTaskRow['status']>('all')
  const [myTaskDueFilter, setMyTaskDueFilter] = useState<'all' | 'due_soon' | 'overdue'>('all')
  const [myTaskSearchInput, setMyTaskSearchInput] = useState('')
  const [myTaskSearch, setMyTaskSearch] = useState('')
  const [taskNotesFor, setTaskNotesFor] = useState('')
  const [taskNoteDraft, setTaskNoteDraft] = useState('')
  const [taskNotesSearch, setTaskNotesSearch] = useState('')
  const [taskNotesAfter, setTaskNotesAfter] = useState('')
  const [taskNotesBefore, setTaskNotesBefore] = useState('')
  const [pendingTaskAction, setPendingTaskAction] = useState<{ taskId: string; status: 'blocked' | 'completed' } | null>(null)
  const [taskActionReason, setTaskActionReason] = useState('')
  const [focusedTaskId, setFocusedTaskId] = useState('')
  const isKagawad = membership?.role?.key === 'kagawad'
  useEffect(() => { setPage(0); setMyTaskPage(0); setTaskAssignmentHistoryPage(0); setCompletedWorkPage(0); setCompletedWorkExportMessage(''); setDueDateHistoryPage(0); setDueDateHistoryFilters({ status: 'all', search: '', createdAfter: '', createdBefore: '', reviewedAfter: '', reviewedBefore: '' }); setDueDateHistoryDraft({ status: 'all', search: '', createdAfter: '', createdBefore: '', reviewedAfter: '', reviewedBefore: '' }); setDueDateHistoryFilterError(''); setDueDateHistoryExportMessage(''); setCompletedWorkFilters({ search: '', completedAfter: '', completedBefore: '' }); setCompletedWorkDraft({ search: '', completedAfter: '', completedBefore: '' }); setTaskHistoryDraft({ search: '', status: 'all', assignedAfter: '', assignedBefore: '' }); setTaskHistoryFilters({ search: '', status: 'all', assignedAfter: '', assignedBefore: '' }); setMyTaskStatus('all'); setMyTaskDueFilter('all'); setMyTaskSearch(''); setMyTaskSearchInput(''); setTaskNotesFor(''); setTaskNoteDraft('') }, [tenantId])
  useEffect(() => {
    if (!focusId) return
    setFocusedTaskId(focusId)
    onFocusHandled?.()
  }, [focusId, onFocusHandled])
  useEffect(() => {
    if (!focusDueDateRequestStatus || !isKagawad) return
    const filters = { status: focusDueDateRequestStatus, search: '', createdAfter: '', createdBefore: '', reviewedAfter: focusDueDateRequestStatus === 'reviewed' ? manilaDateOffset(-30) : '', reviewedBefore: '', }
    setDueDateHistoryFilters(filters)
    setDueDateHistoryDraft(filters)
    setDueDateHistoryPage(0)
    window.requestAnimationFrame(() => document.getElementById('kagawad-due-date-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    onFocusHandled?.()
  }, [focusDueDateRequestStatus, isKagawad, onFocusHandled])
  useEffect(() => {
    if (!focusTaskFilter || !isKagawad) return
    setMyTaskPage(0); setMyTaskSearchInput(''); setMyTaskSearch('')
    if (focusTaskFilter === 'completed_work') {
      window.requestAnimationFrame(() => document.getElementById('kagawad-completed-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } else {
      setMyTaskStatus(['open', 'in_progress', 'blocked', 'completed'].includes(focusTaskFilter) ? focusTaskFilter as CommitteeTaskRow['status'] : 'all')
      setMyTaskDueFilter(focusTaskFilter === 'overdue' || focusTaskFilter === 'due_soon' ? focusTaskFilter : 'all')
      window.requestAnimationFrame(() => document.getElementById('kagawad-my-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
    onFocusHandled?.()
  }, [focusTaskFilter, isKagawad, onFocusHandled])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'committee.manage'], queryFn: () => hasPermission(tenantId, 'committee.manage'), enabled: Boolean(tenantId) })
  const committees = useQuery({ queryKey: ['committees', tenantId, page], queryFn: () => listCommittees(tenantId, page), enabled: Boolean(tenantId) })
  const myTasks = useQuery({ queryKey: ['kagawad-my-action-items', tenantId, myTaskPage, myTaskStatus, myTaskDueFilter, myTaskSearch], queryFn: () => listKagawadAssignedActionItems(tenantId, myTaskPage, myTaskStatus, myTaskSearch, myTaskDueFilter), enabled: Boolean(tenantId && isKagawad) })
  const taskAssignmentHistory = useQuery({ queryKey: ['kagawad-task-assignment-history', tenantId, taskAssignmentHistoryPage, taskHistoryFilters], queryFn: () => listKagawadTaskAssignmentHistory(tenantId, taskAssignmentHistoryPage, taskHistoryFilters), enabled: Boolean(tenantId && isKagawad) })
  const completedWork = useQuery({ queryKey: ['kagawad-completed-work', tenantId, completedWorkPage, completedWorkFilters], queryFn: () => listKagawadCompletedWork(tenantId, completedWorkPage, completedWorkFilters), enabled: Boolean(tenantId && isKagawad) })
  const dueDateHistory = useQuery({ queryKey: ['kagawad-due-date-request-history', tenantId, dueDateHistoryPage, dueDateHistoryFilters], queryFn: () => searchKagawadDueDateRequestHistory(tenantId, dueDateHistoryPage, dueDateHistoryFilters), enabled: Boolean(tenantId && isKagawad) })
  const taskNotes = useQuery({ queryKey: ['kagawad-action-item-notes', tenantId, taskNotesFor], queryFn: () => listKagawadActionItemNotes(taskNotesFor), enabled: Boolean(tenantId && taskNotesFor && isKagawad) })
  useEffect(() => {
    if (!pendingTaskAction || !isKagawad) return
    const frame = window.requestAnimationFrame(() => document.getElementById(`kagawad-my-task-${pendingTaskAction.taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    return () => window.cancelAnimationFrame(frame)
  }, [isKagawad, myTasks.data, pendingTaskAction])
  const visibleTaskNotes = taskNotes.data?.filter((note) => {
    const matchesSearch = `${note.author_name} ${note.note}`.toLocaleLowerCase().includes(taskNotesSearch.trim().toLocaleLowerCase())
    const noteDate = dateInputValue(note.created_at)
    return matchesSearch && (!taskNotesAfter || noteDate >= taskNotesAfter) && (!taskNotesBefore || noteDate <= taskNotesBefore)
  }) ?? []
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
      queryClient.invalidateQueries({ queryKey: ['kagawad-completed-work', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['kagawad-action-item-notes', tenantId, taskNotesFor] }),
    ])
  }

  async function exportCompletedWorkHistory() {
    setExportingCompletedWork(true)
    setCompletedWorkExportMessage('Preparing your matching completed-work history…')
    try {
      const firstPage = await listKagawadCompletedWork(tenantId, 0, completedWorkFilters, 50)
      if (firstPage.totalCount > 10_000) {
        throw new Error('There are more than 10,000 matching completions. Add a date or search filter and try again.')
      }
      const rows = [...firstPage.rows]
      const pageCount = Math.ceil(firstPage.totalCount / 50)
      for (let exportPage = 1; exportPage < pageCount; exportPage += 1) {
        const result = await listKagawadCompletedWork(tenantId, exportPage, completedWorkFilters, 50)
        rows.push(...result.rows)
      }
      const csv = encodeCsv([
        ['Task', 'Committee', 'Completion summary', 'Completed at'],
        ...rows.map((row) => [row.task_title, row.committee_name, row.summary, row.completed_at]),
      ])
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `kabalikat-my-completed-work-${dateInputValue(new Date())}.csv`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setCompletedWorkExportMessage(`Export ready with ${rows.length.toLocaleString()} matching completions.`)
    } catch (exportError) {
      setCompletedWorkExportMessage(exportError instanceof Error && exportError.message.startsWith('There are more than')
        ? exportError.message
        : 'Unable to export your completed-work history. Try again.')
    } finally {
      setExportingCompletedWork(false)
    }
  }

  async function exportTaskAssignmentHistory() {
    setExportingTaskHistory(true)
    setTaskHistoryExportMessage('Preparing your matching assignment history…')
    try {
      const firstPage = await listKagawadTaskAssignmentHistory(tenantId, 0, taskHistoryFilters, 50)
      if (firstPage.totalCount > 10_000) {
        throw new Error('There are more than 10,000 matching assignments. Add a date or search filter and try again.')
      }
      const rows = [...firstPage.rows]
      const pageCount = Math.ceil(firstPage.totalCount / 50)
      for (let exportPage = 1; exportPage < pageCount; exportPage += 1) {
        const result = await listKagawadTaskAssignmentHistory(tenantId, exportPage, taskHistoryFilters, 50)
        rows.push(...result.rows)
      }
      const csv = encodeCsv([
        ['Task', 'Committee', 'Current status', 'Due date', 'Assigned at', 'Assigned by', 'Transferred from'],
        ...rows.map((row) => [row.task_title, row.committee_name, row.task_status, row.due_date, row.assigned_at, row.assigned_by_name, row.previous_assignee_name]),
      ])
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `kabalikat-my-task-assignment-history-${dateInputValue(new Date())}.csv`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setTaskHistoryExportMessage(`Export ready with ${rows.length.toLocaleString()} matching assignments.`)
    } catch (exportError) {
      setTaskHistoryExportMessage(exportError instanceof Error && exportError.message.startsWith('There are more than')
        ? exportError.message
        : 'Unable to export your assignment history. Try again.')
    } finally {
      setExportingTaskHistory(false)
    }
  }

  async function exportDueDateRequestHistory() {
    setExportingDueDateHistory(true)
    setDueDateHistoryExportMessage('Preparing your matching due-date request history…')
    try {
      const firstPage = await searchKagawadDueDateRequestHistory(tenantId, 0, dueDateHistoryFilters, 50)
      if (firstPage.totalCount > 10_000) {
        throw new Error('There are more than 10,000 matching requests. Add a date or search filter and try again.')
      }
      const rows = [...firstPage.rows]
      const pageCount = Math.ceil(firstPage.totalCount / 50)
      for (let exportPage = 1; exportPage < pageCount; exportPage += 1) {
        const result = await searchKagawadDueDateRequestHistory(tenantId, exportPage, dueDateHistoryFilters, 50)
        rows.push(...result.rows)
      }
      const csv = encodeCsv([
        ['Task', 'Committee', 'Status', 'Previous due date', 'Proposed due date', 'Reason', 'Decision', 'Reviewer', 'Submitted at', 'Reviewed at'],
        ...rows.map((row) => [row.task_title, row.committee_name, row.status, row.current_due_date, row.proposed_due_date, row.reason, row.decision_note, row.reviewer_name, row.created_at, row.reviewed_at]),
      ])
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `kabalikat-my-due-date-requests-${dateInputValue(new Date())}.csv`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDueDateHistoryExportMessage(`Export ready with ${rows.length.toLocaleString()} matching requests.`)
    } catch (exportError) {
      setDueDateHistoryExportMessage(exportError instanceof Error && exportError.message.startsWith('There are more than')
        ? exportError.message
        : 'Unable to export your due-date request history. Try again.')
    } finally {
      setExportingDueDateHistory(false)
    }
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
    if (status === 'completed' && task.status !== 'completed' && isKagawad && task.assigned_to === user?.id) {
      setError(''); setMessage('')
      setMyTaskPage(0); setMyTaskStatus('all'); setMyTaskDueFilter('all')
      setMyTaskSearch(''); setMyTaskSearchInput('')
      setPendingTaskAction({ taskId: task.id, status: 'completed' }); setTaskActionReason('')
      return
    }
    setBusy(true); setError(''); setMessage('')
    try { await updateCommitteeTaskStatus(task.id, status); await refresh(); setMessage('Action item status updated.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the action item.') }
    finally { setBusy(false) }
  }

  async function reassignTask(taskId: string, userId: string) {
    setBusy(true); setError(''); setMessage('')
    try {
      await reassignCommitteeTask(taskId, userId)
      await refresh()
      setMessage('Action item reassigned and assignment history updated.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to reassign this action item.') }
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

  return <section className={`operation-page${isKagawad ? ' kagawad-committee-workspaces-page' : ''}`}>
    <PageHeading title="Committee workspaces" description="Coordinate assigned members and track committee action items.">
      {canManage.data && <button className="button primary" onClick={() => setShowCreate((visible) => !visible)}>New committee</button>}
    </PageHeading>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view assigned committee workspaces." />}
    {Boolean(tenantId) && canManage.isPending && <LoadingNotice compact />}
    {canManage.error && <ErrorNotice message="Committee management access could not be checked. Existing assignments can still be viewed; management controls are unavailable until access can be verified." onRetry={() => void canManage.refetch()} retrying={canManage.isFetching} />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {focusedTaskId && <FocusedCommitteeTask tenantId={tenantId} taskId={focusedTaskId} onClose={() => setFocusedTaskId('')} />}
    {canManage.data && tenantId && <><CommitteeDueDateReviewQueue tenantId={tenantId} focused={focusDueDateReviewQueue} onFocusHandled={onFocusHandled} /><CommitteeDueDateRequestHistory tenantId={tenantId} /></>}
    {Boolean(tenantId) && !canManage.isPending && !canManage.error && !canManage.data && <div className="ops-panel archive-access"><UsersRound size={20} /><div><strong>Committee access is assignment-based</strong><p>You will see committees after an authorized administrator assigns you to one.</p></div></div>}
    {isKagawad && <section id="kagawad-due-date-history" className="ops-panel kagawad-due-date-history" aria-labelledby="kagawad-due-date-history-title">
      <div className="ops-panel-heading"><div><h2 id="kagawad-due-date-history-title">My due-date requests</h2><p>Search your submitted requests and see the manager’s decision and reviewer.</p></div><History size={19} /></div>
      <form className="kagawad-due-date-history-filters" onSubmit={(event) => {
        event.preventDefault()
        if (dueDateHistoryDraft.createdAfter && dueDateHistoryDraft.createdBefore && dueDateHistoryDraft.createdAfter > dueDateHistoryDraft.createdBefore) {
          setDueDateHistoryFilterError('The submission start date must be on or before the end date.')
          return
        }
        if (dueDateHistoryDraft.reviewedAfter && dueDateHistoryDraft.reviewedBefore && dueDateHistoryDraft.reviewedAfter > dueDateHistoryDraft.reviewedBefore) {
          setDueDateHistoryFilterError('The review start date must be on or before the end date.')
          return
        }
        setDueDateHistoryFilterError('')
        setDueDateHistoryPage(0)
        setDueDateHistoryFilters({ ...dueDateHistoryDraft, search: dueDateHistoryDraft.search.trim() })
      }}>
        <label>Search requests<input type="search" maxLength={100} placeholder="Task, committee, or reason" value={dueDateHistoryDraft.search} onChange={(event) => setDueDateHistoryDraft((current) => ({ ...current, search: event.target.value }))} /></label>
        <label>Status<select value={dueDateHistoryDraft.status} onChange={(event) => setDueDateHistoryDraft((current) => ({ ...current, status: event.target.value }))}><option value="all">All statuses</option><option value="pending">Awaiting review</option><option value="reviewed">Reviewed</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="withdrawn">Withdrawn</option></select></label>
        <label>Submitted on or after<input type="date" max={dueDateHistoryDraft.createdBefore || undefined} value={dueDateHistoryDraft.createdAfter} onChange={(event) => setDueDateHistoryDraft((current) => ({ ...current, createdAfter: event.target.value }))} /></label>
        <label>Submitted on or before<input type="date" min={dueDateHistoryDraft.createdAfter || undefined} value={dueDateHistoryDraft.createdBefore} onChange={(event) => setDueDateHistoryDraft((current) => ({ ...current, createdBefore: event.target.value }))} /></label>
        <label>Reviewed on or after<input type="date" max={dueDateHistoryDraft.reviewedBefore || undefined} value={dueDateHistoryDraft.reviewedAfter} onChange={(event) => setDueDateHistoryDraft((current) => ({ ...current, reviewedAfter: event.target.value }))} /></label>
        <label>Reviewed on or before<input type="date" min={dueDateHistoryDraft.reviewedAfter || undefined} value={dueDateHistoryDraft.reviewedBefore} onChange={(event) => setDueDateHistoryDraft((current) => ({ ...current, reviewedBefore: event.target.value }))} /></label>
        <div className="kagawad-due-date-history-actions"><button className="button primary" type="submit">Apply filters</button><button className="button outline" type="button" onClick={() => { const empty = { status: 'all', search: '', createdAfter: '', createdBefore: '', reviewedAfter: '', reviewedBefore: '' }; setDueDateHistoryDraft(empty); setDueDateHistoryFilters(empty); setDueDateHistoryFilterError(''); setDueDateHistoryExportMessage(''); setDueDateHistoryPage(0) }} disabled={dueDateHistoryDraft.status === 'all' && !dueDateHistoryDraft.search && !dueDateHistoryDraft.createdAfter && !dueDateHistoryDraft.createdBefore && !dueDateHistoryDraft.reviewedAfter && !dueDateHistoryDraft.reviewedBefore}>Clear</button><button className="button outline" type="button" onClick={() => void exportDueDateRequestHistory()} disabled={exportingDueDateHistory || !dueDateHistory.data?.totalCount}><Download size={15} />{exportingDueDateHistory ? 'Preparing…' : 'Export CSV'}</button></div>
      </form>
      {dueDateHistoryFilterError && <p className="field-hint" role="alert">{dueDateHistoryFilterError}</p>}
      {dueDateHistoryExportMessage && <p className="field-hint" role={dueDateHistoryExportMessage.startsWith('There are more than') || dueDateHistoryExportMessage.startsWith('Unable') ? 'alert' : 'status'}>{dueDateHistoryExportMessage}</p>}
      {dueDateHistory.isPending ? <LoadingNotice compact /> : dueDateHistory.error ? <ErrorNotice message="Your due-date request history could not be loaded." onRetry={() => void dueDateHistory.refetch()} retrying={dueDateHistory.isFetching} /> : dueDateHistory.data?.rows.length ? <>
        <ol className="kagawad-due-date-history-list">{dueDateHistory.data.rows.map((entry) => <li key={entry.id}>
          <div><span className={`due-date-request-status-badge ${entry.status}`}>{entry.status === 'pending' ? 'Awaiting review' : entry.status === 'withdrawn' ? 'Withdrawn' : entry.status === 'approved' ? 'Approved' : 'Declined'}</span><strong>{entry.task_title}</strong><small>{entry.committee_name} · Submitted {formatDateTime(entry.created_at)}</small></div>
          <p>{entry.current_due_date ? `Requested ${formatManilaDate(entry.current_due_date)} → ${formatManilaDate(entry.proposed_due_date)}` : `Proposed date: ${formatManilaDate(entry.proposed_due_date)}`}</p>
          <p className="committee-due-request-reason">{entry.reason}</p>
          {entry.status !== 'pending' && <><small>{entry.status === 'withdrawn' ? 'Withdrawn by' : 'Reviewed by'} {entry.reviewer_name || 'a committee member'}{entry.reviewed_at ? ` · ${formatDateTime(entry.reviewed_at)}` : ''}</small>{entry.decision_note && <p className="due-date-decision-note">{entry.decision_note}</p>}</>}
        </li>)}</ol>
        {dueDateHistory.data.totalCount > 10 && <div className="committee-picker-pagination"><span>Page {dueDateHistoryPage + 1} of {Math.ceil(dueDateHistory.data.totalCount / 10)} · {dueDateHistory.data.totalCount} requests</span><div><button type="button" className="button outline" disabled={dueDateHistoryPage === 0 || dueDateHistory.isFetching} onClick={() => setDueDateHistoryPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={(dueDateHistoryPage + 1) * 10 >= dueDateHistory.data.totalCount || dueDateHistory.isFetching} onClick={() => setDueDateHistoryPage((current) => current + 1)}>Next</button></div></div>}
      </> : <p className="field-hint">{dueDateHistoryFilters.status !== 'all' || dueDateHistoryFilters.search || dueDateHistoryFilters.createdAfter || dueDateHistoryFilters.createdBefore || dueDateHistoryFilters.reviewedAfter || dueDateHistoryFilters.reviewedBefore ? 'No due-date requests match these filters.' : 'Your due-date requests will appear here.'}</p>}
    </section>}
    {isKagawad && <section className="ops-panel kagawad-completed-work" id="kagawad-completed-work" aria-labelledby="kagawad-completed-work-title">
      <div className="ops-panel-heading"><div><h2 id="kagawad-completed-work-title">My completed work</h2><p>Completion summaries you submitted, including tasks later transferred or archived.</p></div><CheckCircle2 size={19} /></div>
      <form className="kagawad-completed-work-filters" onSubmit={(event) => { event.preventDefault(); if (completedWorkDraft.completedAfter && completedWorkDraft.completedBefore && completedWorkDraft.completedAfter > completedWorkDraft.completedBefore) { setError('The completion start date must be on or before the end date.'); return } setError(''); setCompletedWorkExportMessage(''); setCompletedWorkPage(0); setCompletedWorkFilters({ ...completedWorkDraft, search: completedWorkDraft.search.trim() }) }}>
        <label>Search completed work<input type="search" maxLength={100} placeholder="Task, committee, or summary" value={completedWorkDraft.search} onChange={(event) => setCompletedWorkDraft((current) => ({ ...current, search: event.target.value }))} /></label>
        <label>Completed on or after<input type="date" value={completedWorkDraft.completedAfter} onChange={(event) => setCompletedWorkDraft((current) => ({ ...current, completedAfter: event.target.value }))} /></label>
        <label>Completed on or before<input type="date" value={completedWorkDraft.completedBefore} onChange={(event) => setCompletedWorkDraft((current) => ({ ...current, completedBefore: event.target.value }))} /></label>
        <div className="kagawad-completed-work-filter-actions"><button className="button primary" type="submit">Apply filters</button><button className="button outline" type="button" onClick={() => { const empty = { search: '', completedAfter: '', completedBefore: '' }; setCompletedWorkDraft(empty); setCompletedWorkFilters(empty); setCompletedWorkPage(0); setCompletedWorkExportMessage(''); setError('') }}>Clear</button><button className="button outline" type="button" onClick={() => void exportCompletedWorkHistory()} disabled={exportingCompletedWork || !completedWork.data?.totalCount}><Download size={15} />{exportingCompletedWork ? 'Preparing…' : 'Export CSV'}</button></div>
      </form>
      {completedWorkExportMessage && <p className="field-hint" role={completedWorkExportMessage.startsWith('There are more than') || completedWorkExportMessage.startsWith('Unable') ? 'alert' : 'status'}>{completedWorkExportMessage}</p>}
      {completedWork.isPending ? <LoadingNotice compact /> : completedWork.error ? <ErrorNotice message="Your completed-work history could not be loaded." onRetry={() => void completedWork.refetch()} retrying={completedWork.isFetching} /> : completedWork.data?.rows.length ? <>
        <ol className="kagawad-completed-work-list">{completedWork.data.rows.map((entry) => <li key={entry.id}><div><strong>{entry.task_title}</strong><small>{entry.committee_name} · Completed {formatDateTime(entry.completed_at)}</small></div><p>{entry.summary}</p></li>)}</ol>
        {completedWork.data.totalCount > 10 && <nav className="committee-picker-pagination" aria-label="Completed-work history pages"><span>Page {completedWorkPage + 1} of {Math.ceil(completedWork.data.totalCount / 10)} · {completedWork.data.totalCount} completions</span><div><button type="button" className="button outline" disabled={completedWorkPage === 0 || completedWork.isFetching} onClick={() => setCompletedWorkPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={(completedWorkPage + 1) * 10 >= completedWork.data.totalCount || completedWork.isFetching} onClick={() => setCompletedWorkPage((current) => current + 1)}>Next</button></div></nav>}
      </> : <p className="field-hint">{completedWorkFilters.search || completedWorkFilters.completedAfter || completedWorkFilters.completedBefore ? 'No completed work matches these filters.' : 'Your task completion summaries will appear here.'}</p>}
    </section>}
    {isKagawad && <section className="ops-panel kagawad-invited-meetings" aria-labelledby="kagawad-task-assignment-history-title">
      <div className="ops-panel-heading"><div><h2 id="kagawad-task-assignment-history-title">Task assignment history</h2><p>Assignments recorded for you, including completed work and tasks later transferred away.</p></div><History size={19} /></div>
      <form className="kagawad-assignment-history-filters" onSubmit={(event) => { event.preventDefault(); if (taskHistoryDraft.assignedAfter && taskHistoryDraft.assignedBefore && taskHistoryDraft.assignedAfter > taskHistoryDraft.assignedBefore) return; setTaskAssignmentHistoryPage(0); setTaskHistoryFilters({ ...taskHistoryDraft, search: taskHistoryDraft.search.trim() }) }}>
        <label>Search task or committee<input type="search" maxLength={100} placeholder="Task or committee name" value={taskHistoryDraft.search} onChange={(event) => setTaskHistoryDraft((current) => ({ ...current, search: event.target.value }))} /></label>
        <label>Status<select value={taskHistoryDraft.status} onChange={(event) => setTaskHistoryDraft((current) => ({ ...current, status: event.target.value }))}><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select></label>
        <label>Assigned on or after<input type="date" max={taskHistoryDraft.assignedBefore || undefined} value={taskHistoryDraft.assignedAfter} onChange={(event) => setTaskHistoryDraft((current) => ({ ...current, assignedAfter: event.target.value }))} /></label>
        <label>Assigned on or before<input type="date" min={taskHistoryDraft.assignedAfter || undefined} value={taskHistoryDraft.assignedBefore} onChange={(event) => setTaskHistoryDraft((current) => ({ ...current, assignedBefore: event.target.value }))} /></label>
        <div className="kagawad-assignment-history-actions"><button className="button primary" type="submit">Apply filters</button><button className="button outline" type="button" onClick={() => { const empty = { search: '', status: 'all', assignedAfter: '', assignedBefore: '' }; setTaskHistoryDraft(empty); setTaskHistoryFilters(empty); setTaskAssignmentHistoryPage(0); setTaskHistoryExportMessage('') }}>Clear</button><button className="button outline" type="button" onClick={() => void exportTaskAssignmentHistory()} disabled={exportingTaskHistory || !taskAssignmentHistory.data?.totalCount}><Download size={15} />{exportingTaskHistory ? 'Preparing…' : 'Export CSV'}</button></div>
      </form>
      {taskHistoryExportMessage && <p className="field-hint" role={taskHistoryExportMessage.startsWith('There are more than') || taskHistoryExportMessage.startsWith('Unable') ? 'alert' : 'status'}>{taskHistoryExportMessage}</p>}
      {taskHistoryDraft.assignedAfter && taskHistoryDraft.assignedBefore && taskHistoryDraft.assignedAfter > taskHistoryDraft.assignedBefore && <p className="account-security-error" role="alert">The start date must be on or before the end date.</p>}
      {taskAssignmentHistory.isPending ? <LoadingNotice compact /> : taskAssignmentHistory.error ? <ErrorNotice message="Your task assignment history could not be loaded." onRetry={() => void taskAssignmentHistory.refetch()} retrying={taskAssignmentHistory.isFetching} /> : taskAssignmentHistory.data?.rows.length ? <>
        <ul className="kagawad-invited-meeting-list">{taskAssignmentHistory.data.rows.map((entry) => <li key={entry.id}>
          <div><strong>{entry.task_title}</strong><small>{entry.committee_name}{entry.due_date ? ` · Due ${formatManilaDate(entry.due_date)}` : ' · No due date'}</small><small>Assigned {formatDateTime(entry.assigned_at)}{entry.assigned_by_name ? ` by ${entry.assigned_by_name}` : ''}</small>{entry.previous_assignee_name ? <small>Transferred from {entry.previous_assignee_name}</small> : !entry.assigned_by_name && <small>Assigner details were not recorded for this earlier entry.</small>}</div>
          <StatusPill status={entry.task_status} />
        </li>)}</ul>
        {taskAssignmentHistory.data.totalCount > 10 && <div className="committee-picker-pagination"><span>Page {taskAssignmentHistoryPage + 1} of {Math.ceil(taskAssignmentHistory.data.totalCount / 10)} · {taskAssignmentHistory.data.totalCount} assignments</span><div><button type="button" className="button outline" disabled={taskAssignmentHistoryPage === 0 || taskAssignmentHistory.isFetching} onClick={() => setTaskAssignmentHistoryPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={(taskAssignmentHistoryPage + 1) * 10 >= taskAssignmentHistory.data.totalCount || taskAssignmentHistory.isFetching} onClick={() => setTaskAssignmentHistoryPage((current) => current + 1)}>Next</button></div></div>}
      </> : <p className="field-hint">{taskHistoryFilters.search || taskHistoryFilters.status !== 'all' || taskHistoryFilters.assignedAfter || taskHistoryFilters.assignedBefore ? 'No task assignments match these filters.' : 'No task assignments have been recorded yet.'}</p>}
    </section>}
    {isKagawad && <section className="ops-panel kagawad-my-work" id="kagawad-my-work" aria-labelledby="kagawad-my-work-title">
      <div className="ops-panel-heading"><div><h2 id="kagawad-my-work-title">My assigned action items</h2><p>Find your assigned tasks by status, committee, or due date.</p></div><UsersRound size={19} /></div>
      <form className="kagawad-action-item-filters" onSubmit={(event) => { event.preventDefault(); setMyTaskPage(0); setMyTaskSearch(myTaskSearchInput.trim()) }}>
        <label>Search tasks<input value={myTaskSearchInput} maxLength={100} placeholder="Task or committee" onChange={(event) => setMyTaskSearchInput(event.target.value)} /></label>
        <label>Status<select value={myTaskStatus} onChange={(event) => { setMyTaskPage(0); setMyTaskStatus(event.target.value as typeof myTaskStatus) }}><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select></label>
        <label>Due date<select value={myTaskDueFilter} onChange={(event) => { setMyTaskPage(0); setMyTaskDueFilter(event.target.value as typeof myTaskDueFilter) }}><option value="all">All due dates</option><option value="due_soon">Due in 7 days</option><option value="overdue">Overdue</option></select></label>
        <button className="button outline">Search</button>
      </form>
      {myTasks.isPending && <LoadingNotice compact />}
      {myTasks.error && <ErrorNotice message="Your assigned action items could not be loaded." onRetry={() => void myTasks.refetch()} retrying={myTasks.isFetching} />}
      {myTasks.data?.totalCount === 0 && <p className="field-hint">{myTaskSearch || myTaskStatus !== 'all' || myTaskDueFilter !== 'all' ? 'No assigned tasks match these filters.' : 'No tasks are assigned to you yet.'}</p>}
      {Boolean(myTasks.data?.rows.length) && <ul className="kagawad-my-task-list">{myTasks.data?.rows.map((task) => <li id={`kagawad-my-task-${task.id}`} key={task.id}>
        <div><strong>{task.title}</strong><small>{task.committee_name}{task.due_date ? ` · Due ${formatManilaDate(task.due_date)}` : ' · No due date'}</small>{task.description && <p>{task.description}</p>}
          <KagawadTaskStatusHistory taskId={task.id} />
          {task.status !== 'completed' && <KagawadDueDateRequestPanel taskId={task.id} currentDueDate={task.due_date} disabled={pendingTaskAction?.taskId === task.id} />}
          {pendingTaskAction?.taskId === task.id && <form className={`kagawad-task-action-form ${pendingTaskAction.status}`} onSubmit={(event) => void submitTaskAction(task.id, event)}><label htmlFor={`task-action-${task.id}`}>{pendingTaskAction.status === 'blocked' ? 'Why is this task blocked?' : 'What was completed?'}<textarea id={`task-action-${task.id}`} value={taskActionReason} minLength={3} maxLength={2000} required autoFocus placeholder={pendingTaskAction.status === 'blocked' ? 'Describe what is preventing progress and what support is needed.' : 'Summarize the work completed and any useful handoff details.'} onChange={(event) => setTaskActionReason(event.target.value)} /></label><div><button className="button primary" disabled={busy || taskActionReason.trim().length < 3}>{busy ? 'Sending…' : pendingTaskAction.status === 'blocked' ? 'Report blocker' : 'Complete task'}</button><button type="button" className="button outline" disabled={busy} onClick={() => { setPendingTaskAction(null); setTaskActionReason('') }}>Cancel</button></div></form>}
          <button type="button" className="text-action kagawad-task-note-toggle" aria-expanded={taskNotesFor === task.id} onClick={() => { setTaskNotesFor((current) => current === task.id ? '' : task.id); setTaskNoteDraft(''); setTaskNotesSearch(''); setTaskNotesAfter(''); setTaskNotesBefore('') }}><MessageSquareText size={14} />{taskNotesFor === task.id ? 'Hide progress notes' : 'Progress notes'}</button>
          {taskNotesFor === task.id && <div className="kagawad-task-notes">
            {taskNotes.data?.length ? <div className="kagawad-task-note-filters"><label>Search notes<input type="search" maxLength={100} placeholder="Author or message" value={taskNotesSearch} onChange={(event) => setTaskNotesSearch(event.target.value)} /></label><label>From<input type="date" max={taskNotesBefore || undefined} value={taskNotesAfter} onChange={(event) => setTaskNotesAfter(event.target.value)} /></label><label>To<input type="date" min={taskNotesAfter || undefined} value={taskNotesBefore} onChange={(event) => setTaskNotesBefore(event.target.value)} /></label><button type="button" className="button outline" onClick={() => { setTaskNotesSearch(''); setTaskNotesAfter(''); setTaskNotesBefore('') }} disabled={!taskNotesSearch && !taskNotesAfter && !taskNotesBefore}>Clear filters</button></div> : null}
            {taskNotesAfter && taskNotesBefore && taskNotesAfter > taskNotesBefore && <p className="field-hint" role="alert">The start date must be on or before the end date.</p>}
            {taskNotes.isPending ? <LoadingNotice compact /> : taskNotes.error ? <ErrorNotice message="Progress notes could not be loaded." onRetry={() => void taskNotes.refetch()} retrying={taskNotes.isFetching} /> : taskNotes.data?.length ? visibleTaskNotes.length ? <ol>{visibleTaskNotes.map((note) => <li key={note.id}><p>{note.note}</p><small>{note.author_name} · {formatDateTime(note.created_at)}</small></li>)}</ol> : <p className="field-hint">No progress notes match these filters.</p> : <p className="field-hint">No progress notes yet.</p>}
            <form onSubmit={(event) => void submitTaskNote(task.id, event)}><label htmlFor={`task-note-${task.id}`}>Add a progress or blocker note<textarea id={`task-note-${task.id}`} value={taskNoteDraft} maxLength={2000} minLength={3} required placeholder="Share what changed or what is blocking this task." onChange={(event) => setTaskNoteDraft(event.target.value)} /></label><button className="button outline" disabled={busy || taskNoteDraft.trim().length < 3}>Add note</button></form>
          </div>}
        </div>
        <div className="committee-task-status"><StatusPill status={task.status} /><select aria-label={`Update status for ${task.title}`} value={task.status} disabled={busy} onChange={(event) => { const nextStatus = event.target.value as CommitteeTaskRow['status']; if ((nextStatus === 'blocked' || nextStatus === 'completed') && task.status !== nextStatus) { setPendingTaskAction({ taskId: task.id, status: nextStatus }); setTaskActionReason('') } else void changeStatus(task, nextStatus) }}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select></div>
      </li>)}</ul>}
      {myTaskPages > 1 && <div className="committee-picker-pagination"><span>Page {myTaskPage + 1} of {myTaskPages} · {myTasks.data?.totalCount ?? 0} tasks</span><div><button type="button" className="button outline" disabled={myTaskPage === 0 || myTasks.isFetching} onClick={() => setMyTaskPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={myTaskPage + 1 >= myTaskPages || myTasks.isFetching} onClick={() => setMyTaskPage((current) => current + 1)}>Next</button></div></div>}
    </section>}
    {showCreate && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void submitCommittee(event)}><div className="ops-panel-heading"><div><h2>Create a committee</h2><p>Only authorized committee managers can configure workspaces.</p></div><UsersRound size={18} /></div><div className="ops-form-grid"><label>Committee name<input name="name" maxLength={120} required /></label><label className="span-two">Purpose / description<textarea name="description" maxLength={1000} /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Create committee</button></div></form>}
    {committees.isPending && tenantId && <LoadingNotice />}{committees.error && <ErrorNotice message="Committee workspaces could not be loaded." onRetry={() => void committees.refetch()} retrying={committees.isFetching} />}
    {committees.data?.totalCount === 0 && <div className="ops-empty"><UsersRound size={22} /><strong>No committee workspaces assigned</strong><p>Ask an authorized Captain or Secretary to create or assign a committee.</p></div>}
    <div className="committee-workspace-list">{committees.data?.rows.map((committee) => <CommitteeWorkspaceCard key={committee.id} tenantId={tenantId} committee={committee} canManage={Boolean(canManage.data)} currentUserId={user?.id ?? ''} busy={busy} onAssign={(event) => void assignMember(committee.id, event)} onAddTask={(event) => void addTask(committee.id, event)} onChangeTask={(task, status) => void changeStatus(task, status)} onReassignTask={(taskId, userId) => void reassignTask(taskId, userId)} />)}</div>
    {totalPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="Committee pages">
      <span className="muted">Page {page + 1} of {totalPages} - {committees.data?.totalCount ?? 0} committees</span>
      <div className="finance-review-actions">
        <button className="button outline" disabled={page === 0 || committees.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button>
        <button className="button outline" disabled={page + 1 >= totalPages || committees.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button>
      </div>
    </nav>}
  </section>
}
