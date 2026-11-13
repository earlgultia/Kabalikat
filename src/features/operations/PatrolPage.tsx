import { useEffect, useState, type FormEvent, type SyntheticEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Download, MapPinned, Route, Search } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { addPatrolLog, cancelPatrolShift, completePatrolShift, createPatrolShift, findVisiblePatrolShiftPage, getPatrolCoverageSummary, listPatrolLogs, listPatrolShifts, listUpcomingPatrolShifts, PATROL_LOG_PAGE_SIZE, PATROL_SHIFT_PAGE_SIZE, reschedulePatrolShift, startPatrolShift } from './patrol-data'
import { TanodPicker } from './TanodPicker'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime, getManilaDateInputValue } from './format'
import { encodeCsv } from './csv'

const scheduleSchema = z.object({ assignee: z.string().uuid(), title: z.string().trim().min(3).max(140), area: z.string().trim().min(2).max(240), start: z.string().min(1), end: z.string().min(1) })
const rescheduleSchema = z.object({ title: z.string().trim().min(3).max(140), area: z.string().trim().min(2).max(240), start: z.string().min(1), end: z.string().min(1), reason: z.string().trim().min(3).max(500) })
const completionSchema = z.object({ summary: z.string().trim().min(10).max(1500) })

function toDateTimeInput(value: string) {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function PatrolLogHistory({ tenantId, shiftId }: { tenantId: string; shiftId: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [entryType, setEntryType] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const logs = useQuery({ queryKey: ['patrol-logs', tenantId, shiftId, page, entryType, from, to], queryFn: () => listPatrolLogs(tenantId, shiftId, page, { entryType, from, to }), enabled: open })
  const totalPages = Math.ceil((logs.data?.totalCount ?? 0) / PATROL_LOG_PAGE_SIZE)
  return <details className="incident-history" onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open)}>
    <summary>Shift log{logs.data ? ` (${logs.data.totalCount})` : ''}</summary>
    <div className="patrol-log-filters" aria-label="Filter patrol shift history">
      <label>Log type<select value={entryType} onChange={(event) => { setEntryType(event.target.value); setPage(0) }}><option value="all">All log entries</option><option value="shift_started">Shift started</option><option value="checkpoint">Checkpoints</option><option value="observation">Observations</option><option value="shift_completed">Shift handovers</option><option value="shift_cancelled">Cancellations</option><option value="shift_rescheduled">Schedule changes</option></select></label>
      <label>From<input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(0) }} /></label>
      <label>To<input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(0) }} /></label>
    </div>
    {logs.isPending && open && <LoadingNotice compact />}
    {logs.error && <ErrorNotice message="Unable to load this shift history." onRetry={() => void logs.refetch()} retrying={logs.isFetching} />}
    {logs.data?.totalCount === 0 && <p>No log entries match these filters.</p>}
    {logs.data?.rows.length ? <ol>{logs.data.rows.map((log) => <li key={log.id}><strong>{log.entry_type.replace('_', ' ')}</strong><span>{formatDateTime(log.created_at)}{log.location_note ? ` · ${log.location_note}` : ''}</span>{log.details && <p>{log.details}</p>}</li>)}</ol> : null}
    {totalPages > 1 && <div className="ops-form-actions"><span className="muted">Page {page + 1} of {totalPages}</span><div className="finance-review-actions">
      <button className="button outline" disabled={page === 0 || logs.isFetching} onClick={() => setPage((current) => current - 1)}><span aria-hidden="true">‹ </span>Previous</button>
      <button className="button outline" disabled={page + 1 >= totalPages || logs.isFetching} onClick={() => setPage((current) => current + 1)}>Next<span aria-hidden="true"> ›</span></button>
    </div></div>}
  </details>
}

export function PatrolPage({ focusId, focusStatus, onFocusHandled }: { focusId?: string; focusStatus?: 'scheduled' | 'active'; onFocusHandled?: () => void }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'patrol.manage'], queryFn: () => hasPermission(tenantId, 'patrol.manage'), enabled: Boolean(tenantId) })
  const canAccess = useQuery({ queryKey: ['permission', tenantId, 'patrol.access'], queryFn: () => hasPermission(tenantId, 'patrol.access'), enabled: Boolean(tenantId) })
  const enabled = Boolean(tenantId && (canManage.data || canAccess.data))
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'active' | 'completed' | 'cancelled'>('all')
  const [upcomingOnly, setUpcomingOnly] = useState(false)
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false)
  const [coverageFrom, setCoverageFrom] = useState(() => `${getManilaDateInputValue().slice(0, 7)}-01`)
  const [coverageTo, setCoverageTo] = useState(() => getManilaDateInputValue())
  const [focusReadyId, setFocusReadyId] = useState('')
  const [reschedulingId, setReschedulingId] = useState('')
  useEffect(() => { setPage(0); setSearchInput(''); setSearch(''); setStatusFilter('all'); setUpcomingOnly(false); setAssignedToMeOnly(false) }, [tenantId])
  useEffect(() => {
    if (!focusStatus || !enabled) return
    setPage(0); setSearchInput(''); setSearch(''); setStatusFilter(focusStatus); setUpcomingOnly(focusStatus === 'scheduled'); setAssignedToMeOnly(true)
    window.requestAnimationFrame(() => document.getElementById('patrol-shift-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    onFocusHandled?.()
  }, [enabled, focusStatus, onFocusHandled])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchInput])
  const shifts = useQuery({ queryKey: ['patrol-shifts', tenantId, page, search, statusFilter, upcomingOnly, assignedToMeOnly, user?.id], queryFn: () => upcomingOnly ? listUpcomingPatrolShifts(tenantId, page, PATROL_SHIFT_PAGE_SIZE, assignedToMeOnly ? user?.id : undefined) : listPatrolShifts(tenantId, page, search, statusFilter, PATROL_SHIFT_PAGE_SIZE, assignedToMeOnly ? user?.id : undefined), enabled })
  const coverage = useQuery({
    queryKey: ['patrol-coverage-summary', tenantId, coverageFrom, coverageTo],
    queryFn: () => getPatrolCoverageSummary(tenantId, coverageFrom, coverageTo),
    enabled: Boolean(tenantId && canManage.data && coverageFrom && coverageTo && coverageTo >= coverageFrom),
  })
  useEffect(() => {
    if (!shifts.isPending && !shifts.isError && page > 0 && shifts.data?.rows.length === 0) setPage((current) => Math.max(0, current - 1))
  }, [shifts.data?.rows.length, shifts.isError, shifts.isPending, page])
  const totalPages = Math.ceil((shifts.data?.totalCount ?? 0) / PATROL_SHIFT_PAGE_SIZE)
  useEffect(() => {
    if (!focusId || !tenantId || !enabled) return
    let cancelled = false
    setSearchInput(''); setSearch(''); setStatusFilter('all'); setUpcomingOnly(false); setPage(0); setFocusReadyId('')
    void findVisiblePatrolShiftPage(tenantId, focusId).then((targetPage) => {
      if (cancelled) return
      if (targetPage === null) { onFocusHandled?.(); return }
      setPage(targetPage)
      setFocusReadyId(focusId)
    }).catch(() => { if (!cancelled) onFocusHandled?.() })
    return () => { cancelled = true }
  }, [enabled, focusId, onFocusHandled, tenantId])
  useEffect(() => {
    if (!focusId || focusReadyId !== focusId || !shifts.data?.rows.some((shift) => shift.id === focusId)) return
    const target = document.getElementById(`patrol-shift-${focusId}`)
    if (!target) return
    target.focus({ preventScroll: true }); target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    onFocusHandled?.()
  }, [focusId, focusReadyId, onFocusHandled, shifts.data])
  const [showForm, setShowForm] = useState(false)
  const [assigneeId, setAssigneeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['patrol-shifts', tenantId] }), queryClient.invalidateQueries({ queryKey: ['patrol-logs', tenantId] })])
  }

  async function exportShifts() {
    setExporting(true); setError(''); setMessage('')
    try {
      const rows = [] as Awaited<ReturnType<typeof listPatrolShifts>>['rows']
      let totalCount = 0
      for (let exportPage = 0; exportPage === 0 || rows.length < totalCount; exportPage += 1) {
        const result = upcomingOnly
          ? await listUpcomingPatrolShifts(tenantId, exportPage, 100, assignedToMeOnly ? user?.id : undefined)
          : await listPatrolShifts(tenantId, exportPage, search, statusFilter, 100, assignedToMeOnly ? user?.id : undefined)
        rows.push(...result.rows)
        totalCount = result.totalCount
        if (result.rows.length === 0) break
      }
      const csv = encodeCsv([
        ['Shift title', 'Patrol area', 'Starts at', 'Ends at', 'Status'],
        ...rows.map((shift) => [shift.title, shift.patrol_area, shift.starts_at, shift.ends_at, shift.status]),
      ])
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `kabalikat-patrol-shifts-${getManilaDateInputValue()}.csv`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(`Downloaded ${rows.length} matching patrol ${rows.length === 1 ? 'shift' : 'shifts'}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export the patrol shift queue.')
    } finally { setExporting(false) }
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
    try { await createPatrolShift({ tenantId, assigneeId: parsed.data.assignee, title: parsed.data.title, area: parsed.data.area, startsAt: starts.toISOString(), endsAt: ends.toISOString() }); setPage(0); await refresh(); form.reset(); setAssigneeId(''); setShowForm(false); setMessage('Patrol shift scheduled.') }
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

  async function completeShift(shiftId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = completionSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Add a short shift handover.'); return }
    if (await runAction(() => completePatrolShift(shiftId, parsed.data.summary), 'Patrol shift completed and handover saved.')) form.reset()
  }

  async function reschedule(shiftId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = rescheduleSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the updated patrol details.'); return }
    const starts = new Date(parsed.data.start)
    const ends = new Date(parsed.data.end)
    if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || starts <= new Date() || ends <= starts || ends.getTime() - starts.getTime() > 12 * 60 * 60 * 1000) {
      setError('Choose a future shift time lasting no more than 12 hours.'); return
    }
    const success = await runAction(() => reschedulePatrolShift({
      shiftId, title: parsed.data.title, area: parsed.data.area,
      startsAt: starts.toISOString(), endsAt: ends.toISOString(), reason: parsed.data.reason,
    }), 'Patrol shift rescheduled. The assigned Tanod has been notified.')
    if (success) setReschedulingId('')
  }

  const assigneeName = (id: string) => id === user?.id ? 'You' : 'Assigned Tanod'

  return <section className="operation-page">
    <PageHeading title="Tanod patrols" description="Schedule patrol shifts and record manual checkpoint notes.">
      {canManage.data && <button className="button outline" onClick={() => void exportShifts()} disabled={exporting || !shifts.data?.totalCount}><Download size={16} />{exporting ? 'Preparing export…' : 'Export matching CSV'}</button>}
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}>Schedule patrol</button>}
    </PageHeading>
    <div className="ops-panel incident-guidance"><MapPinned size={18} /><p><strong>Manual logs only.</strong> Record a checkpoint or observation as a short note. This workspace does not track live location or contact emergency services.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view patrol shifts and logs." />}
    {Boolean(tenantId) && (canManage.isPending || canAccess.isPending) && <LoadingNotice compact />}
    {(canManage.error || canAccess.error) && <ErrorNotice message="Your patrol workspace access could not be checked. Refresh the page or contact your barangay administrator." onRetry={() => { void canManage.refetch(); void canAccess.refetch() }} retrying={canManage.isFetching || canAccess.isFetching} />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canManage.data && !canAccess.data && !canManage.isPending && !canAccess.isPending && !canManage.error && !canAccess.error && <EmptyNotice title="Patrol access is restricted" detail="Only authorized Captains and Tanods can access patrol shifts. Contact your barangay administrator if you need access." />}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void schedule(event)}><div className="ops-panel-heading"><div><h2>Schedule a patrol shift</h2><p>Assign an active Tanod from this barangay.</p></div><ClipboardList size={19} /></div><div className="ops-form-grid">
      <TanodPicker tenantId={tenantId} permission="patrol.manage" name="assignee" selectedId={assigneeId} onChange={setAssigneeId} />
      <label>Shift title<input name="title" maxLength={140} required /></label>
      <label className="span-two">Patrol area<input name="area" maxLength={240} placeholder="General area or route description" required /></label>
      <label>Starts<input type="datetime-local" name="start" required /></label><label>Ends<input type="datetime-local" name="end" required /></label>
    </div><div className="ops-form-actions"><button className="button primary" disabled={busy || !assigneeId}>Schedule shift</button></div></form>}
    {assignedToMeOnly && <div className="ops-success" role="status"><span>Showing patrol shifts assigned to you.</span><button type="button" className="text-action" onClick={() => { setAssignedToMeOnly(false); setUpcomingOnly(false); setStatusFilter('all'); setPage(0) }}>Show all shifts</button></div>}
    {enabled && <div className="health-outreach-filters">
      <label className="archive-search"><Search size={16} /><input type="search" aria-label="Search patrol shifts" maxLength={100} placeholder="Search shift title or patrol area" value={searchInput} onChange={(event) => { setUpcomingOnly(false); setSearchInput(event.target.value) }} /></label>
      <label>Status<select value={statusFilter} onChange={(event) => { setUpcomingOnly(false); setStatusFilter(event.target.value as typeof statusFilter); setPage(0) }}><option value="all">All statuses</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
    </div>}
    {canManage.data && <section className="ops-panel patrol-coverage" aria-labelledby="patrol-coverage-title">
      <div className="patrol-coverage-heading"><div><h2 id="patrol-coverage-title">Patrol coverage</h2><p>Shift and field-log totals for the selected dates.</p></div>
        <div className="patrol-coverage-dates"><label>From<input type="date" value={coverageFrom} max={coverageTo || undefined} onChange={(event) => setCoverageFrom(event.target.value)} /></label><label>To<input type="date" value={coverageTo} min={coverageFrom || undefined} onChange={(event) => setCoverageTo(event.target.value)} /></label></div>
      </div>
      {coverage.isPending && <LoadingNotice compact />}
      {coverage.error && <ErrorNotice message="Unable to load patrol coverage for these dates." onRetry={() => void coverage.refetch()} retrying={coverage.isFetching} />}
      {coverage.data && <div className="patrol-coverage-grid">
        <article><span>Total shifts</span><strong>{coverage.data.total_shifts.toLocaleString()}</strong></article>
        <article><span>Scheduled</span><strong>{coverage.data.scheduled_shifts.toLocaleString()}</strong></article>
        <article><span>Active</span><strong>{coverage.data.active_shifts.toLocaleString()}</strong></article>
        <article><span>Completed</span><strong>{coverage.data.completed_shifts.toLocaleString()}</strong></article>
        <article><span>Cancelled</span><strong>{coverage.data.cancelled_shifts.toLocaleString()}</strong></article>
        <article><span>Checkpoints</span><strong>{coverage.data.checkpoint_entries.toLocaleString()}</strong></article>
        <article><span>Observations</span><strong>{coverage.data.observation_entries.toLocaleString()}</strong></article>
        <article><span>Handover reports</span><strong>{coverage.data.handover_summaries.toLocaleString()}</strong></article>
      </div>}
    </section>}
    {shifts.isPending && enabled && <LoadingNotice />}{shifts.error && <ErrorNotice message={shifts.error.message} onRetry={() => void shifts.refetch()} retrying={shifts.isFetching} />}
    {shifts.data?.totalCount === 0 && <div className="ops-empty"><Route size={22} /><strong>{search || statusFilter !== 'all' ? 'No matching patrol shifts' : 'No patrol shifts'}</strong><p>{search || statusFilter !== 'all' ? 'Try another search or status.' : 'Scheduled shifts and your assigned patrols appear here.'}</p></div>}
    <div className="patrol-list" id="patrol-shift-list">{shifts.data?.rows.map((shift) => {
      const isAssigned = shift.assigned_to === user?.id
      return <article id={`patrol-shift-${shift.id}`} tabIndex={-1} className="ops-panel patrol-card" key={shift.id}>
        <header><div><StatusPill status={shift.status} /><h2>{shift.title}</h2></div><strong>{assigneeName(shift.assigned_to)}</strong></header>
        <div className="incident-meta"><span>{shift.patrol_area}</span><span>{formatDateTime(shift.starts_at)} – {formatDateTime(shift.ends_at)}</span></div>
        {shift.cancellation_note && <p className="finance-review-note">Cancellation reason: {shift.cancellation_note}</p>}
        {isAssigned && shift.status === 'scheduled' && <button className="button primary patrol-action" disabled={busy} onClick={() => void runAction(() => startPatrolShift(shift.id), 'Patrol shift started.')}>Start shift</button>}
        {canManage.data && shift.status === 'scheduled' && <button className="button outline patrol-action" disabled={busy} onClick={() => { setError(''); setMessage(''); setReschedulingId((current) => current === shift.id ? '' : shift.id) }}>{reschedulingId === shift.id ? 'Close schedule editor' : 'Reschedule'}</button>}
        {canManage.data && shift.status === 'scheduled' && reschedulingId === shift.id && <form className="ops-panel ops-form patrol-reschedule-form" onSubmit={(event) => void reschedule(shift.id, event)}>
          <div className="ops-panel-heading"><div><h3>Update patrol schedule</h3><p>Give the assigned Tanod a reason for the change.</p></div></div>
          <div className="ops-form-grid">
            <label>Shift title<input name="title" defaultValue={shift.title} maxLength={140} required /></label>
            <label>Patrol area<input name="area" defaultValue={shift.patrol_area} maxLength={240} required /></label>
            <label>Starts<input name="start" type="datetime-local" defaultValue={toDateTimeInput(shift.starts_at)} required /></label>
            <label>Ends<input name="end" type="datetime-local" defaultValue={toDateTimeInput(shift.ends_at)} required /></label>
            <label className="span-two">Reason for the change<textarea name="reason" minLength={3} maxLength={500} required placeholder="Explain why this shift needs a new time or route." /></label>
          </div>
          <div className="ops-form-actions"><button className="button primary" disabled={busy}>Save schedule change</button></div>
        </form>}
        {isAssigned && shift.status === 'active' && <><form className="patrol-log-form" onSubmit={(event) => void addLog(shift.id, event)}><label>Log type<select name="entryType"><option value="checkpoint">Checkpoint</option><option value="observation">Observation</option></select></label><label>Location note (optional)<input name="location" maxLength={240} placeholder="Landmark or area" /></label><label className="patrol-log-details">Details<textarea name="details" minLength={3} maxLength={1500} required placeholder="Briefly record what happened." /></label><button className="button outline" disabled={busy}>Save log</button></form>
          <form className="patrol-completion-form" onSubmit={(event) => void completeShift(shift.id, event)}>
            <label>End-of-shift handover<textarea name="summary" minLength={10} maxLength={1500} required placeholder="Summarize the patrol, checkpoints covered, and anything the next shift or Captain should know." /></label>
            <p>Keep the handover factual. Do not include sensitive personal details.</p>
            <button className="button primary patrol-action" disabled={busy}>Save handover and complete shift</button>
          </form></>}
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
