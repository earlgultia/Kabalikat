import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, MapPin, Search, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { completeSkEvent, createSkEvent, listSkEventAudit, listSkEvents, reviewSkEvent, SK_EVENT_HISTORY_PAGE_SIZE, SK_EVENT_PAGE_SIZE, type SkEvent } from './sk-events-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const eventSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), location: z.string().trim().min(2).max(240), starts: z.string().min(1), ends: z.string().min(1) })

function SkEventHistory({ tenantId, eventId, enabled }: { tenantId: string; eventId: string; enabled: boolean }) {
  const [page, setPage] = useState(0)
  const history = useQuery({ queryKey: ['sk-event-audit', tenantId, eventId, page], queryFn: () => listSkEventAudit(tenantId, eventId, page), enabled })
  const totalPages = Math.ceil((history.data?.totalCount ?? 0) / SK_EVENT_HISTORY_PAGE_SIZE)
  if (history.isPending) return <p className="field-hint" role="status">Loading activity…</p>
  if (history.error) return <p className="account-security-error" role="alert">Activity history could not be loaded.</p>
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

export function SkEventsPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | SkEvent['status']>('all')
  useEffect(() => { setPage(0); setSearchInput(''); setSearch(''); setStatusFilter('all') }, [tenantId])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchInput])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'sk.event.manage'], queryFn: () => hasPermission(tenantId, 'sk.event.manage'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'sk.event.review'], queryFn: () => hasPermission(tenantId, 'sk.event.review'), enabled: Boolean(tenantId) })
  const events = useQuery({ queryKey: ['sk-events', tenantId, page, search, statusFilter], queryFn: () => listSkEvents(tenantId, page, search, statusFilter), enabled: Boolean(tenantId) })
  useEffect(() => {
    if (!events.isPending && !events.isError && page > 0 && events.data?.rows.length === 0) setPage((current) => Math.max(0, current - 1))
  }, [events.data?.rows.length, events.isError, events.isPending, page])
  const totalPages = Math.ceil((events.data?.totalCount ?? 0) / SK_EVENT_PAGE_SIZE)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: ['sk-events', tenantId] }), queryClient.invalidateQueries({ queryKey: ['sk-event-audit', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-calendar', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-calendar-preview', tenantId] })]) }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = eventSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the event details.'); return }
    const startsAt = new Date(parsed.data.starts), endsAt = new Date(parsed.data.ends)
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError('The event end time must be after its start time.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await createSkEvent({ barangayId: tenantId, title: parsed.data.title, description: parsed.data.description, location: parsed.data.location, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })
      setPage(0); await refresh(); form.reset(); setShowForm(false); setMessage('SK event schedule submitted for Captain review.')
    } catch { setError('Unable to create the event schedule. Check the details and try again.') }
    finally { setBusy(false) }
  }
  async function act(item: SkEvent, action: 'approve' | 'reject' | 'complete') {
    let note: string | null = null
    if (action === 'reject') { note = window.prompt('Reason for returning this schedule (3–1000 characters):')?.trim() ?? ''; if (note.length < 3 || note.length > 1000) return }
    else if (action === 'complete' && !window.confirm('Mark this SK event schedule as complete?')) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (action === 'complete') await completeSkEvent(item.id)
      else await reviewSkEvent(item.id, action === 'approve', note)
      await refresh(); setMessage(action === 'approve' ? 'SK event published.' : action === 'reject' ? 'Schedule returned with a reason.' : 'SK event marked complete.')
    } catch { setError('Unable to update this event. Refresh and try again.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="SK events & programs" description="Schedule youth programs and community events, with Captain review before publication.">
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}><CalendarDays size={16} />Plan an event</button>}
    </PageHeading>
    <div className="ops-panel referral-privacy-notice"><ShieldAlert size={18} /><p><strong>Event schedules only.</strong> This page does not register youth or participants, collect attendance, or store information about minors. Keep private details out of event descriptions.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view published SK events." />}
    {Boolean(tenantId) && (canManage.isPending || canReview.isPending) && <LoadingNotice compact />}
    {(canManage.error || canReview.error) && <ErrorNotice message="SK event management or review access could not be checked. Published events remain available; staff controls are hidden until access can be verified." />}
    {message && <div className="ops-success" role="status"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>Plan an SK program or event</h2><p>Schedules remain private until a Captain publishes them.</p></div><CalendarDays size={19} /></div>
      <div className="ops-form-grid"><label>Event title<input name="title" minLength={3} maxLength={180} required placeholder="Youth community clean-up" /></label><label>Location<input name="location" minLength={2} maxLength={240} required placeholder="Venue or meeting point" /></label><label>Starts<input name="starts" type="datetime-local" required /></label><label>Ends<input name="ends" type="datetime-local" required /></label><label className="span-two">Public event details<textarea name="description" maxLength={2000} placeholder="General schedule and logistics only. Do not include names or personal details." /></label></div>
      <div className="ops-form-actions"><button className="button primary" disabled={busy}>Submit for review</button></div>
    </form>}
    {Boolean(tenantId) && <div className="health-outreach-filters">
      <label className="archive-search"><Search size={16} /><input type="search" aria-label="Search SK events" maxLength={100} placeholder="Search event, location, or details" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
      <label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(0) }}><option value="all">All statuses</option><option value="draft">Awaiting review</option><option value="published">Published</option><option value="completed">Completed</option><option value="cancelled">Returned or cancelled</option></select></label>
    </div>}
    {events.isPending && tenantId && <LoadingNotice />}{events.error && <ErrorNotice message="Unable to load SK event schedules." onRetry={() => void events.refetch()} retrying={events.isFetching} />}
    {events.data?.totalCount === 0 && <div className="ops-empty"><CalendarDays size={22} /><strong>{search || statusFilter !== 'all' ? 'No matching SK events' : 'No SK events scheduled'}</strong><p>{search || statusFilter !== 'all' ? 'Try another search or status.' : 'Published youth programs and events will appear here.'}</p></div>}
    <div className="referral-list">{events.data?.rows.map((item) => <article className="ops-panel referral-card" key={item.id}>
      <div className="referral-card-head"><div><h2>{item.title}</h2><p><MapPin size={14} />{item.location}</p></div><StatusPill status={item.status} /></div>
      {item.description && <p className="referral-summary">{item.description}</p>}
      <div className="referral-meta"><span><strong>Starts</strong>{formatDateTime(item.starts_at)}</span><span><strong>Ends</strong>{formatDateTime(item.ends_at)}</span></div>
      {item.review_note && <p className="field-hint">Review note: {item.review_note}</p>}
      {(canManage.data || canReview.data) && <SkEventActivityDetails tenantId={tenantId} eventId={item.id} />}
      {canReview.data && item.status === 'draft' && <div className="ops-form-actions"><button className="button primary" disabled={busy || item.created_by === user?.id} title={item.created_by === user?.id ? 'The creator cannot approve their own schedule.' : undefined} onClick={() => void act(item, 'approve')}>Publish</button><button className="button outline" disabled={busy} onClick={() => void act(item, 'reject')}>Return with reason</button></div>}
      {canManage.data && item.status === 'published' && new Date(item.ends_at).getTime() <= Date.now() && <div className="ops-form-actions"><button className="button outline" disabled={busy} onClick={() => void act(item, 'complete')}>Mark complete</button></div>}
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
