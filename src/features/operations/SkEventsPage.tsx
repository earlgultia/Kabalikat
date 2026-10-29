import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarDays, CheckCircle2, MapPin, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { completeSkEvent, createSkEvent, listSkEventAudit, listSkEvents, reviewSkEvent, type SkEvent } from './sk-events-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const eventSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), location: z.string().trim().min(2).max(240), starts: z.string().min(1), ends: z.string().min(1) })

export function SkEventsPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'sk.event.manage'], queryFn: () => hasPermission(tenantId, 'sk.event.manage'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'sk.event.review'], queryFn: () => hasPermission(tenantId, 'sk.event.review'), enabled: Boolean(tenantId) })
  const events = useQuery({ queryKey: ['sk-events', tenantId], queryFn: () => listSkEvents(tenantId), enabled: Boolean(tenantId) })
  const audit = useQuery({ queryKey: ['sk-event-audit', tenantId], queryFn: () => listSkEventAudit(tenantId), enabled: Boolean(tenantId) && Boolean(canManage.data || canReview.data) })
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
      await refresh(); form.reset(); setShowForm(false); setMessage('SK event schedule submitted for Captain review.')
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
    {events.isPending && tenantId && <LoadingNotice />}{events.error && <ErrorNotice message="Unable to load SK event schedules." />}
    {events.data?.length === 0 && <div className="ops-empty"><CalendarDays size={22} /><strong>No SK events scheduled</strong><p>Published youth programs and events will appear here.</p></div>}
    <div className="referral-list">{events.data?.map((item) => <article className="ops-panel referral-card" key={item.id}>
      <div className="referral-card-head"><div><h2>{item.title}</h2><p><MapPin size={14} />{item.location}</p></div><StatusPill status={item.status} /></div>
      {item.description && <p className="referral-summary">{item.description}</p>}
      <div className="referral-meta"><span><strong>Starts</strong>{formatDateTime(item.starts_at)}</span><span><strong>Ends</strong>{formatDateTime(item.ends_at)}</span></div>
      {item.review_note && <p className="field-hint">Review note: {item.review_note}</p>}
      {(canManage.data || canReview.data) && <details className="sk-event-audit"><summary>Activity history</summary>{audit.isPending && <p className="field-hint" role="status">Loading activity…</p>}{audit.error && <p className="account-security-error" role="alert">Activity history could not be loaded.</p>}{audit.data && <ol>{audit.data.filter((entry) => entry.event_id === item.id).map((entry) => <li key={entry.id}><span><strong>{entry.action.replace('event_', '').replaceAll('_', ' ')}</strong><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></span>{entry.note && <small>{entry.note}</small>}</li>)}{audit.data.every((entry) => entry.event_id !== item.id) && !audit.isPending && <li><small>No activity is available in the recent history.</small></li>}</ol>}</details>}
      {canReview.data && item.status === 'draft' && <div className="ops-form-actions"><button className="button primary" disabled={busy || item.created_by === user?.id} title={item.created_by === user?.id ? 'The creator cannot approve their own schedule.' : undefined} onClick={() => void act(item, 'approve')}>Publish</button><button className="button outline" disabled={busy} onClick={() => void act(item, 'reject')}>Return with reason</button></div>}
      {canManage.data && item.status === 'published' && new Date(item.ends_at).getTime() <= Date.now() && <div className="ops-form-actions"><button className="button outline" disabled={busy} onClick={() => void act(item, 'complete')}>Mark complete</button></div>}
    </article>)}</div>
  </section>
}
