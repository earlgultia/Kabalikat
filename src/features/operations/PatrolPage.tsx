import { useState, type FormEvent, type SyntheticEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, MapPinned, Route } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { addPatrolLog, cancelPatrolShift, completePatrolShift, createPatrolShift, listPatrolAssignees, listPatrolLogs, listPatrolShifts, PATROL_LOG_PAGE_SIZE, PATROL_SHIFT_PAGE_SIZE, startPatrolShift } from './patrol-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const scheduleSchema = z.object({ assignee: z.string().uuid(), title: z.string().trim().min(3).max(140), area: z.string().trim().min(2).max(240), start: z.string().min(1), end: z.string().min(1) })

function PatrolLogHistory({ tenantId, shiftId }: { tenantId: string; shiftId: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const logs = useQuery({ queryKey: ['patrol-logs', tenantId, shiftId, page], queryFn: () => listPatrolLogs(tenantId, shiftId, page), enabled: open })
  const totalPages = Math.ceil((logs.data?.totalCount ?? 0) / PATROL_LOG_PAGE_SIZE)
  return <details className="incident-history" onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open)}>
    <summary>Shift log{logs.data ? ` (${logs.data.totalCount})` : ''}</summary>
    {logs.isPending && open && <LoadingNotice compact />}
    {logs.error && <ErrorNotice message="Unable to load this shift history." />}
    {logs.data?.totalCount === 0 && <p>No log entries yet.</p>}
    {logs.data?.rows.length ? <ol>{logs.data.rows.map((log) => <li key={log.id}><strong>{log.entry_type.replace('_', ' ')}</strong><span>{formatDateTime(log.created_at)}{log.location_note ? ` · ${log.location_note}` : ''}</span>{log.details && <p>{log.details}</p>}</li>)}</ol> : null}
    {totalPages > 1 && <div className="ops-form-actions"><span className="muted">Page {page + 1} of {totalPages}</span><div className="finance-review-actions">
      <button className="button outline" disabled={page === 0 || logs.isFetching} onClick={() => setPage((current) => current - 1)}><span aria-hidden="true">‹ </span>Previous</button>
      <button className="button outline" disabled={page + 1 >= totalPages || logs.isFetching} onClick={() => setPage((current) => current + 1)}>Next<span aria-hidden="true"> ›</span></button>
    </div></div>}
  </details>
}

export function PatrolPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'patrol.manage'], queryFn: () => hasPermission(tenantId, 'patrol.manage'), enabled: Boolean(tenantId) })
  const canAccess = useQuery({ queryKey: ['permission', tenantId, 'patrol.access'], queryFn: () => hasPermission(tenantId, 'patrol.access'), enabled: Boolean(tenantId) })
  const enabled = Boolean(tenantId && (canManage.data || canAccess.data))
  const [page, setPage] = useState(0)
  const shifts = useQuery({ queryKey: ['patrol-shifts', tenantId, page], queryFn: () => listPatrolShifts(tenantId, page), enabled })
  const totalPages = Math.ceil((shifts.data?.totalCount ?? 0) / PATROL_SHIFT_PAGE_SIZE)
  const assignees = useQuery({ queryKey: ['patrol-assignees', tenantId], queryFn: () => listPatrolAssignees(tenantId), enabled: Boolean(tenantId && canManage.data) })
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['patrol-shifts', tenantId] }), queryClient.invalidateQueries({ queryKey: ['patrol-logs', tenantId] })])
  }

  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = scheduleSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the patrol shift details.'); return }
    const starts = new Date(parsed.data.start)
    const ends = new Date(parsed.data.end)
    if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts || ends.getTime() - starts.getTime() > 12 * 60 * 60 * 1000) { setError('Choose a valid shift time lasting no more than 12 hours.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await createPatrolShift({ tenantId, assigneeId: parsed.data.assignee, title: parsed.data.title, area: parsed.data.area, startsAt: starts.toISOString(), endsAt: ends.toISOString() }); setPage(0); await refresh(); form.reset(); setShowForm(false); setMessage('Patrol shift scheduled.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to schedule this patrol.') }
    finally { setBusy(false) }
  }

  async function runAction(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true); setError(''); setMessage('')
    try { await action(); await refresh(); setMessage(success); return true }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to update this patrol shift.'); return false }
    finally { setBusy(false) }
  }

  async function addLog(shiftId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const entryType = String(data.get('entryType') ?? '')
    const location = String(data.get('location') ?? '').trim()
    const details = String(data.get('details') ?? '').trim()
    if (!['checkpoint','observation'].includes(entryType) || details.length < 3 || details.length > 1500 || location.length > 240) { setError('Add a valid checkpoint or observation with a short description.'); return }
    if (await runAction(() => addPatrolLog(shiftId, entryType, location, details), 'Patrol log entry saved.')) form.reset()
  }

  const assigneeName = (id: string) => id === user?.id ? 'You' : assignees.data?.find((person) => person.user_id === id)?.display_name ?? 'Assigned Tanod'

  return <section className="operation-page">
    <PageHeading title="Tanod patrols" description="Schedule patrol shifts and record manual checkpoint notes.">
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}>Schedule patrol</button>}
    </PageHeading>
    <div className="ops-panel incident-guidance"><MapPinned size={18} /><p><strong>Manual logs only.</strong> Record a checkpoint or observation as a short note. This workspace does not track live location or contact emergency services.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view patrol shifts and logs." />}
    {Boolean(tenantId) && (canManage.isPending || canAccess.isPending) && <LoadingNotice compact />}
    {(canManage.error || canAccess.error) && <ErrorNotice message="Your patrol workspace access could not be checked. Refresh the page or contact your barangay administrator." />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canManage.data && !canAccess.data && !canManage.isPending && !canAccess.isPending && !canManage.error && !canAccess.error && <EmptyNotice title="Patrol access is restricted" detail="Only authorized Captains and Tanods can access patrol shifts. Contact your barangay administrator if you need access." />}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void schedule(event)}><div className="ops-panel-heading"><div><h2>Schedule a patrol shift</h2><p>Assign an active Tanod from this barangay.</p></div><ClipboardList size={19} /></div><div className="ops-form-grid">
      <label>Assigned Tanod<select name="assignee" required defaultValue=""><option value="" disabled>Select active Tanod</option>{assignees.data?.map((person) => <option key={person.user_id} value={person.user_id}>{person.display_name}</option>)}</select></label>
      <label>Shift title<input name="title" maxLength={140} required /></label>
      <label className="span-two">Patrol area<input name="area" maxLength={240} placeholder="General area or route description" required /></label>
      <label>Starts<input type="datetime-local" name="start" required /></label><label>Ends<input type="datetime-local" name="end" required /></label>
    </div><div className="ops-form-actions"><button className="button primary" disabled={busy || assignees.isPending}>Schedule shift</button></div></form>}
    {shifts.isPending && enabled && <LoadingNotice />}{shifts.error && <ErrorNotice message={shifts.error.message} />}
    {shifts.data?.totalCount === 0 && <div className="ops-empty"><Route size={22} /><strong>No patrol shifts</strong><p>Scheduled shifts and your assigned patrols appear here.</p></div>}
    <div className="patrol-list">{shifts.data?.rows.map((shift) => {
      const isAssigned = shift.assigned_to === user?.id
      return <article className="ops-panel patrol-card" key={shift.id}>
        <header><div><StatusPill status={shift.status} /><h2>{shift.title}</h2></div><strong>{assigneeName(shift.assigned_to)}</strong></header>
        <div className="incident-meta"><span>{shift.patrol_area}</span><span>{formatDateTime(shift.starts_at)} – {formatDateTime(shift.ends_at)}</span></div>
        {shift.cancellation_note && <p className="finance-review-note">Cancellation reason: {shift.cancellation_note}</p>}
        {isAssigned && shift.status === 'scheduled' && <button className="button primary patrol-action" disabled={busy} onClick={() => void runAction(() => startPatrolShift(shift.id), 'Patrol shift started.')}>Start shift</button>}
        {isAssigned && shift.status === 'active' && <><form className="patrol-log-form" onSubmit={(event) => void addLog(shift.id, event)}><label>Log type<select name="entryType"><option value="checkpoint">Checkpoint</option><option value="observation">Observation</option></select></label><label>Location note (optional)<input name="location" maxLength={240} placeholder="Landmark or area" /></label><label className="patrol-log-details">Details<textarea name="details" minLength={3} maxLength={1500} required placeholder="Briefly record what happened." /></label><button className="button outline" disabled={busy}>Save log</button></form><button className="button primary patrol-action" disabled={busy} onClick={() => { if (window.confirm('Complete this patrol shift?')) void runAction(() => completePatrolShift(shift.id), 'Patrol shift completed.') }}>Complete shift</button></>}
        {canManage.data && shift.status === 'scheduled' && <button className="button outline patrol-action" disabled={busy} onClick={() => { const reason = window.prompt('Reason for cancelling this shift:') ?? ''; if (reason.trim().length >= 3) void runAction(() => cancelPatrolShift(shift.id, reason), 'Patrol shift cancelled.') }}>Cancel shift</button>}
        <PatrolLogHistory tenantId={tenantId} shiftId={shift.id} />
      </article>
    })}</div>
    {totalPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="Patrol shift pages">
      <span className="muted">Active and upcoming shifts appear first. Page {page + 1} of {totalPages} - {shifts.data?.totalCount ?? 0} shifts</span>
      <div className="finance-review-actions">
        <button className="button outline" disabled={page === 0 || shifts.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button>
        <button className="button outline" disabled={page + 1 >= totalPages || shifts.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button>
      </div>
    </nav>}
  </section>
}
