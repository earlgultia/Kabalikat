import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download, MapPin, Search, Share2, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { cancelSkEvent, completeSkEvent, createSkEvent, getSkEventNotificationSummary, getSkEventQueueSummary, listAllSkEvents, listSkEventAudit, listSkEventScheduleChanges, listSkEvents, rescheduleSkEvent, reviewSkEvent, updateSkEvent, SK_EVENT_HISTORY_PAGE_SIZE, SK_EVENT_PAGE_SIZE, SK_EVENT_SCHEDULE_HISTORY_PAGE_SIZE, type SkEvent } from './sk-events-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const eventSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), location: z.string().trim().min(2).max(240), starts: z.string().min(1), ends: z.string().min(1) })
const rescheduleSchema = z.object({ location: z.string().trim().min(2).max(240), starts: z.string().min(1), ends: z.string().min(1), reason: z.string().trim().min(3).max(1000) })
const toDateTimeInput = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }
const localDateBoundary = (value: string, dayOffset = 0) => {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day + dayOffset)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function downloadSkEventCalendarFile(event: SkEvent) {
  const encoder = new TextEncoder()
  const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
  const toUtc = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const foldLine = (line: string) => {
    let current = ''
    let bytes = 0
    const folded: string[] = []
    for (const character of line) {
      const size = encoder.encode(character).length
      if (bytes + size > 75) { folded.push(current); current = ` ${character}`; bytes = size + 1 }
      else { current += character; bytes += size }
    }
    folded.push(current)
    return folded.join('\r\n')
  }
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ArkByte Technologies//KABALIKAT//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${event.id}@kabalikat.local`, `DTSTAMP:${toUtc(new Date().toISOString())}`,
    `DTSTART:${toUtc(event.starts_at)}`, `DTEND:${toUtc(event.ends_at)}`, `SUMMARY:${escapeText(event.title)}`,
    `LOCATION:${escapeText(event.location)}`, ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    'END:VEVENT', 'END:VCALENDAR', '',
  ]
  const url = URL.createObjectURL(new Blob([lines.map(foldLine).join('\r\n')], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${event.title.trim().replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'sk-event'}.ics`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadSkEventCsv(events: SkEvent[]) {
  const cell = (value: string) => {
    let firstVisibleCharacter = 0
    while (firstVisibleCharacter < value.length && value.charCodeAt(firstVisibleCharacter) <= 32) firstVisibleCharacter += 1
    const safe = /^[=+\-@]/.test(value.slice(firstVisibleCharacter)) ? `'${value}` : value
    return `"${safe.replace(/"/g, '""')}"`
  }
  const columns = ['Title', 'Public details', 'Location', 'Starts (UTC)', 'Ends (UTC)', 'Status']
  const rows = events.map((event) => [event.title, event.description, event.location, event.starts_at, event.ends_at, event.status])
  const csv = [columns, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}\r\n`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `kabalikat-sk-events-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function SkEventHistory({ tenantId, eventId, enabled }: { tenantId: string; eventId: string; enabled: boolean }) {
  const [page, setPage] = useState(0)
  const history = useQuery({ queryKey: ['sk-event-audit', tenantId, eventId, page], queryFn: () => listSkEventAudit(tenantId, eventId, page), enabled })
  const totalPages = Math.ceil((history.data?.totalCount ?? 0) / SK_EVENT_HISTORY_PAGE_SIZE)
  if (history.isPending) return <p className="field-hint" role="status">Loading activity…</p>
  if (history.error) return <ErrorNotice message="Activity history could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} />
  return <>
    {history.data?.rows.length ? <ol>{history.data.rows.map((entry) => <li key={entry.id}><span><strong>{entry.action.replace('event_', '').replaceAll('_', ' ')}</strong><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></span>{entry.note && <small>{entry.note}</small>}</li>)}</ol> : <p className="field-hint">No activity has been recorded for this event.</p>}
    {totalPages > 1 && <div className="finance-review-actions" aria-label="Event history pages"><span className="field-hint">Page {page + 1} of {totalPages}</span><button className="button outline" disabled={page === 0 || history.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={15} />Previous</button><button className="button outline" disabled={page + 1 >= totalPages || history.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></div>}
  </>
}

function SkEventActivityDetails({ tenantId, eventId }: { tenantId: string; eventId: string }) {
  const [open, setOpen] = useState(false)
  return <details className="sk-event-audit" onToggle={(toggle) => setOpen(toggle.currentTarget.open)}>
    <summary>Activity history</summary>
    <SkEventHistory tenantId={tenantId} eventId={eventId} enabled={open} />
  </details>
}

function SkEventScheduleHistory({ tenantId, eventId }: { tenantId: string; eventId: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const history = useQuery({ queryKey: ['sk-event-schedule-history', tenantId, eventId, page], queryFn: () => listSkEventScheduleChanges(tenantId, eventId, page), enabled: open })
  const totalPages = Math.ceil((history.data?.totalCount ?? 0) / SK_EVENT_SCHEDULE_HISTORY_PAGE_SIZE)
  return <details className="sk-event-audit" onToggle={(toggle) => setOpen(toggle.currentTarget.open)}>
    <summary>Schedule change history</summary>
    {open && history.isPending && <p className="field-hint" role="status">Loading schedule history…</p>}
    {open && history.error && <ErrorNotice message="Schedule history could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} />}
    {open && history.data?.rows.length === 0 && <p className="field-hint">No schedule changes have been recorded.</p>}
    {history.data?.rows.length ? <ol>{history.data.rows.map((change) => <li key={change.id}><span><strong>Updated {formatDateTime(change.created_at)}</strong></span><small>Previously: {change.previous_location} · {formatDateTime(change.previous_starts_at)} to {formatDateTime(change.previous_ends_at)}</small><small>Now: {change.new_location} · {formatDateTime(change.new_starts_at)} to {formatDateTime(change.new_ends_at)}</small><small>Reason: {change.reason}</small></li>)}</ol> : null}
    {open && totalPages > 1 && <div className="finance-review-actions" aria-label="Schedule history pages"><span className="field-hint">Page {page + 1} of {totalPages}</span><button className="button outline" disabled={page === 0 || history.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={15} />Previous</button><button className="button outline" disabled={page + 1 >= totalPages || history.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></div>}
  </details>
}

function SkEventNotificationReach({ tenantId, eventId }: { tenantId: string; eventId: string }) {
  const [open, setOpen] = useState(false)
  const summary = useQuery({ queryKey: ['sk-event-notification-summary', tenantId, eventId], queryFn: () => getSkEventNotificationSummary(tenantId, eventId), enabled: open, staleTime: 15_000 })
  const rows = [
    { label: 'Publication', sent: summary.data?.publication_sent, read: summary.data?.publication_read },
    { label: 'Schedule update', sent: summary.data?.schedule_update_sent, read: summary.data?.schedule_update_read },
    { label: 'Cancellation', sent: summary.data?.cancellation_sent, read: summary.data?.cancellation_read },
    { label: 'Completion', sent: summary.data?.completion_sent, read: summary.data?.completion_read },
  ]
  return <details className="sk-event-audit sk-event-reach" onToggle={(toggle) => setOpen(toggle.currentTarget.open)}>
    <summary>Notification reach</summary>
    {open && summary.isPending && <p className="field-hint" role="status">Loading notification counts…</p>}
    {open && summary.error && <ErrorNotice message="Notification counts could not be loaded." onRetry={() => void summary.refetch()} retrying={summary.isFetching} />}
    {open && summary.data && <>
      <div className="sk-event-reach-grid">{rows.map((row) => <div className="sk-event-reach-item" key={row.label}><strong>{row.label}</strong><span>{(row.sent ?? 0).toLocaleString()} notified · {(row.read ?? 0).toLocaleString()} marked read</span></div>)}</div>
      <p className="field-hint">These counts track in-app notification status only. They do not indicate RSVP or attendance.</p>
    </>}
  </details>
}

export function SkEventsPage({ focusId, focusPage, focusStatus, onFocusHandled }: { focusId?: string; focusPage?: number; focusStatus?: SkEvent['status']; onFocusHandled?: () => void }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | SkEvent['status']>('all')
  const [startsOnOrAfter, setStartsOnOrAfter] = useState('')
  const [startsOnOrBefore, setStartsOnOrBefore] = useState('')
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [reschedulingEventId, setReschedulingEventId] = useState<string | null>(null)
  useEffect(() => { setPage(0); setSearchInput(''); setSearch(''); setStatusFilter('all'); setStartsOnOrAfter(''); setStartsOnOrBefore('') }, [tenantId])
  useEffect(() => {
    if (!focusId && !focusStatus) return
    setPage(focusPage ?? 0); setSearchInput(''); setSearch(''); setStatusFilter(focusStatus ?? 'draft'); setStartsOnOrAfter(''); setStartsOnOrBefore('')
    if (!focusId) onFocusHandled?.()
  }, [focusId, focusPage, focusStatus, onFocusHandled])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchInput])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'sk.event.manage'], queryFn: () => hasPermission(tenantId, 'sk.event.manage'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'sk.event.review'], queryFn: () => hasPermission(tenantId, 'sk.event.review'), enabled: Boolean(tenantId) })
  const dateRangeInvalid = Boolean(startsOnOrAfter && startsOnOrBefore && startsOnOrBefore < startsOnOrAfter)
  const startsAfter = localDateBoundary(startsOnOrAfter)
  const startsBefore = localDateBoundary(startsOnOrBefore, 1)
  const events = useQuery({ queryKey: ['sk-events', tenantId, page, search, statusFilter, startsOnOrAfter, startsOnOrBefore], queryFn: () => listSkEvents(tenantId, page, search, statusFilter, startsAfter, startsBefore), enabled: Boolean(tenantId && !dateRangeInvalid) })
  const summary = useQuery({ queryKey: ['sk-event-summary', tenantId, search, statusFilter, startsOnOrAfter, startsOnOrBefore], queryFn: () => getSkEventQueueSummary(tenantId, search, statusFilter, startsAfter, startsBefore), enabled: Boolean(tenantId && !dateRangeInvalid), staleTime: 30_000 })
  useEffect(() => {
    if (!events.isPending && !events.isError && page > 0 && events.data?.rows.length === 0) setPage((current) => Math.max(0, current - 1))
  }, [events.data?.rows.length, events.isError, events.isPending, page])
  useEffect(() => {
    if (!focusId || !events.data?.rows.some((item) => item.id === focusId)) return
    document.getElementById(`sk-event-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    onFocusHandled?.()
  }, [events.data?.rows, focusId, onFocusHandled])
  const totalPages = Math.ceil((events.data?.totalCount ?? 0) / SK_EVENT_PAGE_SIZE)
  const minimumEventStart = toDateTimeInput(new Date(Date.now() + 60_000).toISOString())
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportProgress, setExportProgress] = useState('')
  const [exportError, setExportError] = useState('')
  const [shareFeedback, setShareFeedback] = useState<{ eventId: string; message: string } | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [earlyCompletionEventId, setEarlyCompletionEventId] = useState<string | null>(null)
  const [earlyCompletionReason, setEarlyCompletionReason] = useState('')

  async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: ['sk-events', tenantId] }), queryClient.invalidateQueries({ queryKey: ['sk-event-summary', tenantId] }), queryClient.invalidateQueries({ queryKey: ['sk-event-audit', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-calendar', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-calendar-preview', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-notifications', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-notification-unread-count', tenantId] })]) }
  async function exportSchedules() {
    setExportBusy(true); setExportError(''); setExportProgress('Preparing export…')
    try {
      const rows = await listAllSkEvents(tenantId, search, statusFilter, startsAfter, startsBefore, (loaded, total) => setExportProgress(`Preparing ${loaded.toLocaleString()} of ${total.toLocaleString()} schedules…`))
      if (!rows.length) { setExportError('There are no matching schedules to export.'); return }
      downloadSkEventCsv(rows)
      setExportProgress(`Downloaded ${rows.length.toLocaleString()} schedules.`)
    } catch { setExportError('Unable to export SK event schedules. Refresh the queue and try again.') }
    finally { setExportBusy(false) }
  }
  async function shareEventDetails(item: SkEvent) {
    const text = [`${item.title}`, `When: ${formatDateTime(item.starts_at)} to ${formatDateTime(item.ends_at)}`, `Where: ${item.location}`, ...(item.description ? [`Details: ${item.description}`] : [])].join('\n')
    const nativeShare = (navigator as unknown as { share?: (data: ShareData) => Promise<void> }).share
    setShareFeedback(null)
    try {
      if (nativeShare) await nativeShare.call(navigator, { title: item.title, text })
      else await navigator.clipboard.writeText(text)
      setShareFeedback({ eventId: item.id, message: nativeShare ? 'Event details are ready to share.' : 'Event details copied. Paste them into your message.' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareFeedback({ eventId: item.id, message: 'Sharing is unavailable in this browser. Use Add to calendar to save the schedule.' })
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = eventSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the event details.'); return }
    const startsAt = new Date(parsed.data.starts), endsAt = new Date(parsed.data.ends)
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date() || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError('Choose a future start time and an end time after the start.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await createSkEvent({ barangayId: tenantId, title: parsed.data.title, description: parsed.data.description, location: parsed.data.location, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })
      setPage(0); await refresh(); form.reset(); setShowForm(false); setMessage('SK event schedule submitted for Captain review.')
    } catch { setError('Unable to create the event schedule. Check the details and try again.') }
    finally { setBusy(false) }
  }
  async function edit(item: SkEvent, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = eventSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the event details.'); return }
    const startsAt = new Date(parsed.data.starts), endsAt = new Date(parsed.data.ends)
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date() || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError('Choose a future start time and an end time after the start.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await updateSkEvent({ id: item.id, title: parsed.data.title, description: parsed.data.description, location: parsed.data.location, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })
      setEditingEventId(null); await refresh(); setMessage(item.status === 'changes_requested' ? 'Updated SK event resubmitted for Captain review.' : 'Draft SK event updated.')
    } catch { setError('Unable to update this event schedule. Check the details and try again.') }
    finally { setBusy(false) }
  }
  async function reschedule(item: SkEvent, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = rescheduleSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the updated schedule and reason.'); return }
    const startsAt = new Date(parsed.data.starts), endsAt = new Date(parsed.data.ends)
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date() || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError('Choose a future start time and an end time after the start.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await rescheduleSkEvent({ id: item.id, location: parsed.data.location, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason: parsed.data.reason })
      setReschedulingEventId(null); await refresh(); setMessage('Event schedule updated. Opted-in community members have been notified.')
    } catch { setError('Unable to reschedule this event. Check the details and try again.') }
    finally { setBusy(false) }
  }
  async function completeEarly(item: SkEvent, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = earlyCompletionReason.trim()
    if (reason.length < 3 || reason.length > 1000) { setError('Enter an early completion reason between 3 and 1,000 characters.'); return }
    if (new Date(item.starts_at).getTime() > Date.now()) { setError('An event cannot be completed before it starts.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await completeSkEvent(item.id, reason)
      setEarlyCompletionEventId(null); setEarlyCompletionReason(''); await refresh()
      setMessage('Event completed early. Opted-in community members have been notified.')
    } catch { setError('Unable to complete this event early. Refresh and try again.') }
    finally { setBusy(false) }
  }
  async function act(item: SkEvent, action: 'approve' | 'reject' | 'complete' | 'cancel') {
    let note: string | null = null
    if (action === 'approve' && new Date(item.starts_at) <= new Date()) { setError('This schedule has already started. Return it to the creator so they can choose a future date before publishing.'); return }
    if (action === 'reject') { note = window.prompt('Reason for returning this schedule (3–1000 characters):')?.trim() ?? ''; if (note.length < 3 || note.length > 1000) return }
    else if (action === 'cancel') { note = window.prompt('Reason for cancelling this event (3–1000 characters):')?.trim() ?? ''; if (note.length < 3 || note.length > 1000) return }
    else if (action === 'complete' && !window.confirm('Mark this SK event schedule as complete?')) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (action === 'complete') await completeSkEvent(item.id)
      else if (action === 'cancel') await cancelSkEvent(item.id, note ?? '')
      else await reviewSkEvent(item.id, action === 'approve', note)
      await refresh(); setMessage(action === 'approve' ? 'SK event published.' : action === 'reject' ? 'Schedule returned with a reason.' : action === 'cancel' ? 'Event cancelled. Members have been notified.' : 'SK event marked complete.')
    } catch { setError('Unable to update this event. Refresh and try again.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="SK events & programs" description="Schedule youth programs and community events, with Captain review before publication.">
      {canManage.data && <div className="ops-form-actions"><button className="button outline" type="button" disabled={exportBusy || dateRangeInvalid || !events.data?.totalCount} onClick={() => void exportSchedules()}><Download size={16} />{exportBusy ? 'Preparing export…' : 'Export schedules'}</button><button className="button primary" onClick={() => setShowForm((visible) => !visible)}><CalendarDays size={16} />Plan an event</button></div>}
    </PageHeading>
    {canManage.data && exportProgress && <p className="field-hint" role="status">{exportProgress}</p>}
    {canManage.data && exportError && <p className="account-security-error" role="alert">{exportError}</p>}
    <div className="ops-panel referral-privacy-notice"><ShieldAlert size={18} /><p><strong>Event schedules only.</strong> This page does not register youth or participants, collect attendance, or store information about minors. Keep private details out of event descriptions.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view published SK events." />}
    {Boolean(tenantId) && (canManage.isPending || canReview.isPending) && <LoadingNotice compact />}
    {(canManage.error || canReview.error) && <ErrorNotice message="SK event management or review access could not be checked. Published events remain available; staff controls are hidden until access can be verified." onRetry={() => { void canManage.refetch(); void canReview.refetch() }} retrying={canManage.isFetching || canReview.isFetching} />}
    {message && <div className="ops-success" role="status"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>Plan an SK program or event</h2><p>Schedules remain private until a Captain publishes them.</p></div><CalendarDays size={19} /></div>
      <div className="ops-form-grid"><label>Event title<input name="title" minLength={3} maxLength={180} required placeholder="Youth community clean-up" /></label><label>Location<input name="location" minLength={2} maxLength={240} required placeholder="Venue or meeting point" /></label><label>Starts<input name="starts" type="datetime-local" min={minimumEventStart} required /></label><label>Ends<input name="ends" type="datetime-local" required /></label><label className="span-two">Public event details<textarea name="description" maxLength={2000} placeholder="General schedule and logistics only. Do not include names or personal details." /></label></div>
      <div className="ops-form-actions"><button className="button primary" disabled={busy}>Submit for review</button></div>
    </form>}
    {Boolean(tenantId) && <div className="health-outreach-filters">
      <label className="archive-search"><Search size={16} /><input type="search" aria-label="Search SK events" maxLength={100} placeholder="Search event, location, or details" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
      <label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(0) }}><option value="all">All statuses</option><option value="draft">Awaiting review</option><option value="changes_requested">Changes requested</option><option value="published">Published</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      <label>Starts on or after<input type="date" value={startsOnOrAfter} max={startsOnOrBefore || undefined} onChange={(event) => { setStartsOnOrAfter(event.target.value); setPage(0) }} /></label>
      <label>Starts on or before<input type="date" value={startsOnOrBefore} min={startsOnOrAfter || undefined} onChange={(event) => { setStartsOnOrBefore(event.target.value); setPage(0) }} /></label>
      {(startsOnOrAfter || startsOnOrBefore) && <button type="button" className="button outline" onClick={() => { setStartsOnOrAfter(''); setStartsOnOrBefore(''); setPage(0) }}>Clear dates</button>}
    </div>}
    {dateRangeInvalid && <p className="account-security-error" role="alert">The end date must be the same day or later than the start date.</p>}
    {(startsOnOrAfter || startsOnOrBefore) && !dateRangeInvalid && <p className="field-hint">Dates use your local timezone. Search results, overview counts, and CSV exports use this same start-date window.</p>}
    {summary.error && <ErrorNotice message="Unable to load the SK event overview." onRetry={() => void summary.refetch()} retrying={summary.isFetching} />}
    {summary.data && <section className="health-outreach-summary sk-event-summary" aria-label="SK event schedule overview">
      <article className="ops-panel"><span>Matching events</span><strong>{summary.data.totalCount.toLocaleString()}</strong></article>
      <button type="button" className="ops-panel health-outreach-summary-action" aria-label={`Show ${summary.data.awaitingReviewCount} SK events awaiting review`} onClick={() => { setPage(0); setStatusFilter('draft') }}><span>Awaiting review</span><strong>{summary.data.awaitingReviewCount.toLocaleString()}</strong><small>View review queue</small></button>
      <button type="button" className="ops-panel health-outreach-summary-action" aria-label={`Show ${summary.data.changesRequestedCount} SK events with changes requested`} onClick={() => { setPage(0); setStatusFilter('changes_requested') }}><span>Changes requested</span><strong>{summary.data.changesRequestedCount.toLocaleString()}</strong><small>View returned schedules</small></button>
      <button type="button" className="ops-panel health-outreach-summary-action" aria-label={`Show ${summary.data.publishedCount} published SK events`} onClick={() => { setPage(0); setStatusFilter('published') }}><span>Published</span><strong>{summary.data.publishedCount.toLocaleString()}</strong><small>View published events</small></button>
      <button type="button" className="ops-panel health-outreach-summary-action" aria-label={`Show ${summary.data.completedCount} completed SK events`} onClick={() => { setPage(0); setStatusFilter('completed') }}><span>Completed</span><strong>{summary.data.completedCount.toLocaleString()}</strong><small>View completed events</small></button>
      <button type="button" className="ops-panel health-outreach-summary-action" aria-label={`Show ${summary.data.cancelledCount} cancelled SK events`} onClick={() => { setPage(0); setStatusFilter('cancelled') }}><span>Cancelled</span><strong>{summary.data.cancelledCount.toLocaleString()}</strong><small>View cancelled events</small></button>
    </section>}
    {events.isPending && tenantId && <LoadingNotice />}{events.error && <ErrorNotice message="Unable to load SK event schedules." onRetry={() => void events.refetch()} retrying={events.isFetching} />}
    {events.data?.totalCount === 0 && <div className="ops-empty"><CalendarDays size={22} /><strong>{search || statusFilter !== 'all' || startsOnOrAfter || startsOnOrBefore ? 'No matching SK events' : 'No SK events scheduled'}</strong><p>{search || statusFilter !== 'all' || startsOnOrAfter || startsOnOrBefore ? 'Try another search, status, or date range.' : 'Published youth programs and events will appear here.'}</p></div>}
    <div className="referral-list">{events.data?.rows.map((item) => <article id={`sk-event-${item.id}`} className={`ops-panel referral-card ${item.id === focusId ? 'health-campaign-focused' : ''}`} key={item.id}>
      <div className="referral-card-head"><div><h2>{item.title}</h2><p><MapPin size={14} />{item.location}</p></div><StatusPill status={item.status} /></div>
      {item.description && <p className="referral-summary">{item.description}</p>}
      <div className="referral-meta"><span><strong>Starts</strong>{formatDateTime(item.starts_at)}</span><span><strong>Ends</strong>{formatDateTime(item.ends_at)}</span></div>
      {item.status === 'published' && <div className="ops-form-actions"><button type="button" className="button outline" onClick={() => void shareEventDetails(item)}><Share2 size={15} />Share details</button><button type="button" className="button outline" onClick={() => downloadSkEventCalendarFile(item)}><Download size={15} />Add to calendar</button></div>}
      {item.status === 'published' && shareFeedback?.eventId === item.id && <p className="field-hint" role="status">{shareFeedback.message}</p>}
      {item.review_note && <p className="field-hint">{item.status === 'changes_requested' ? 'Captain feedback: ' : item.status === 'cancelled' ? 'Cancellation reason: ' : 'Review note: '}{item.review_note}</p>}
      {canManage.data && item.created_by === user?.id && ['draft', 'changes_requested'].includes(item.status) && <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy} onClick={() => setEditingEventId((current) => current === item.id ? null : item.id)}>{editingEventId === item.id ? 'Close editor' : item.status === 'changes_requested' ? 'Edit and resubmit' : 'Edit draft'}</button></div>}
      {editingEventId === item.id && <form className="ops-panel ops-form health-campaign-editor" onSubmit={(event) => void edit(item, event)}><div className="ops-form-grid"><label>Event title<input name="title" minLength={3} maxLength={180} defaultValue={item.title} required /></label><label>Location<input name="location" minLength={2} maxLength={240} defaultValue={item.location} required /></label><label>Starts<input name="starts" type="datetime-local" min={minimumEventStart} defaultValue={toDateTimeInput(item.starts_at)} required /></label><label>Ends<input name="ends" type="datetime-local" defaultValue={toDateTimeInput(item.ends_at)} required /></label><label className="span-two">Public event details<textarea name="description" maxLength={2000} defaultValue={item.description} placeholder="General schedule and logistics only. Do not include names or personal details." /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>{item.status === 'changes_requested' ? 'Resubmit for review' : 'Save draft'}</button><button type="button" className="button outline" disabled={busy} onClick={() => setEditingEventId(null)}>Cancel</button></div></form>}
      {(canManage.data || canReview.data) && <SkEventActivityDetails tenantId={tenantId} eventId={item.id} />}
      {['published', 'completed', 'cancelled'].includes(item.status) && <SkEventScheduleHistory key={item.id} tenantId={tenantId} eventId={item.id} />}
      {canManage.data && ['published', 'completed', 'cancelled'].includes(item.status) && <SkEventNotificationReach key={item.id} tenantId={tenantId} eventId={item.id} />}
      {canReview.data && ['draft', 'changes_requested'].includes(item.status) && <><div className="ops-form-actions"><button className="button primary" disabled={busy || item.created_by === user?.id} title={item.created_by === user?.id ? 'The creator cannot approve their own schedule.' : undefined} onClick={() => void act(item, 'approve')}>Publish</button><button className="button outline" disabled={busy || item.created_by === user?.id} title={item.created_by === user?.id ? 'The creator cannot review their own schedule.' : undefined} onClick={() => void act(item, 'reject')}>Return with reason</button></div>{item.created_by === user?.id && <small className="field-hint">Another authorized manager must review this schedule.</small>}</>}
      {canManage.data && item.status === 'published' && new Date(item.ends_at).getTime() <= Date.now() && <div className="ops-form-actions"><button className="button outline" disabled={busy} onClick={() => void act(item, 'complete')}>Mark complete</button></div>}
      {canManage.data && item.status === 'published' && new Date(item.starts_at).getTime() <= Date.now() && new Date(item.ends_at).getTime() > Date.now() && <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy} onClick={() => { setEarlyCompletionEventId((current) => current === item.id ? null : item.id); setEarlyCompletionReason('') }}>{earlyCompletionEventId === item.id ? 'Close early completion' : 'Complete event early'}</button></div>}
      {earlyCompletionEventId === item.id && <form className="ops-panel ops-form health-campaign-editor" onSubmit={(event) => void completeEarly(item, event)}><label>Reason for completing before the scheduled end<textarea value={earlyCompletionReason} minLength={3} maxLength={1000} onChange={(event) => setEarlyCompletionReason(event.target.value)} required placeholder="Explain why the event is ending early. Do not include participant or personal details." /></label><p className="field-hint">The reason is recorded in staff activity history. Opted-in members receive a completion notice.</p><div className="ops-form-actions"><button className="button primary" disabled={busy}>Confirm early completion</button><button type="button" className="button outline" disabled={busy} onClick={() => { setEarlyCompletionEventId(null); setEarlyCompletionReason('') }}>Cancel</button></div></form>}
      {canManage.data && item.status === 'published' && new Date(item.ends_at).getTime() > Date.now() && <div className="ops-form-actions"><button className="button outline" disabled={busy} onClick={() => void act(item, 'cancel')}>Cancel event</button></div>}
      {canManage.data && item.status === 'published' && new Date(item.ends_at).getTime() > Date.now() && <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy} onClick={() => setReschedulingEventId((current) => current === item.id ? null : item.id)}>{reschedulingEventId === item.id ? 'Close rescheduler' : 'Reschedule event'}</button></div>}
      {reschedulingEventId === item.id && <form className="ops-panel ops-form health-campaign-editor" onSubmit={(event) => void reschedule(item, event)}><div className="ops-panel-heading"><div><h3>Update published schedule</h3><p>Members who allow SK updates will be notified of the revised time or location.</p></div><CalendarDays size={18} /></div><div className="ops-form-grid"><label>New location<input name="location" minLength={2} maxLength={240} defaultValue={item.location} required /></label><label>New start<input name="starts" type="datetime-local" min={minimumEventStart} defaultValue={toDateTimeInput(item.starts_at)} required /></label><label>New end<input name="ends" type="datetime-local" defaultValue={toDateTimeInput(item.ends_at)} required /></label><label className="span-two">Public reason for change<textarea name="reason" minLength={3} maxLength={1000} required placeholder="Explain the schedule change without names or private details." /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Save and notify</button><button type="button" className="button outline" disabled={busy} onClick={() => setReschedulingEventId(null)}>Cancel</button></div></form>}
    </article>)}</div>
    {totalPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="SK event pages">
      <span className="muted">Page {page + 1} of {totalPages} · {events.data?.totalCount ?? 0} events</span>
      <div className="finance-review-actions">
        <button className="button outline" disabled={page === 0 || events.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button>
        <button className="button outline" disabled={page + 1 >= totalPages || events.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button>
      </div>
    </nav>}
  </section>
}
