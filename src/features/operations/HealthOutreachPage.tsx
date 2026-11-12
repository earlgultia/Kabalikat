import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarDays, CalendarHeart, CheckCircle2, ChevronLeft, ChevronRight, Download, History, MapPin, Search, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { cancelHealthCampaign, completeHealthCampaign, correctHealthCampaignAttendance, createHealthCampaign, getHealthCampaignNotificationSummary, getHealthCampaignSummary, HEALTH_CAMPAIGN_EVENT_PAGE_SIZE, HEALTH_CAMPAIGN_PAGE_SIZE, HEALTH_CAMPAIGN_SCHEDULE_HISTORY_PAGE_SIZE, listAllHealthCampaigns, listHealthCampaignEvents, listHealthCampaignScheduleChanges, listHealthCampaigns, rescheduleHealthCampaign, reviewHealthCampaign, updateHealthCampaign, type HealthCampaign } from './health-outreach-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime, getManilaDateBoundary, getManilaDateInputValue } from './format'
import { encodeCsv } from './csv'

const campaignSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), location: z.string().trim().min(2).max(240), starts: z.string().min(1), ends: z.string().min(1) })
const rescheduleSchema = z.object({ location: z.string().trim().min(2).max(240), starts: z.string().min(1), ends: z.string().min(1), reason: z.string().trim().min(3).max(1000) })

const campaignEventLabels: Record<string, string> = {
  campaign_created: 'Schedule submitted for review',
  campaign_published: 'Captain published the schedule',
  campaign_rejected: 'Captain requested changes',
  campaign_completed: 'Schedule marked complete',
  campaign_completed_early: 'Outreach completed early',
  campaign_attendance_corrected: 'Aggregate attendance corrected',
  campaign_updated: 'Draft schedule edited',
  campaign_resubmitted: 'Updated schedule sent for review',
  campaign_cancelled: 'Public schedule cancelled',
  campaign_rescheduled: 'Published schedule changed',
}

function HealthCampaignScheduleHistory({ tenantId, campaignId }: { tenantId: string; campaignId: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const history = useQuery({ queryKey: ['health-outreach-schedule-history', tenantId, campaignId, page], queryFn: () => listHealthCampaignScheduleChanges(tenantId, campaignId, page), enabled: open })
  const totalPages = Math.ceil((history.data?.totalCount ?? 0) / HEALTH_CAMPAIGN_SCHEDULE_HISTORY_PAGE_SIZE)
  return <details className="sk-event-audit" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Schedule change history</summary>
    {open && history.isPending && <p className="field-hint" role="status">Loading schedule history…</p>}
    {open && history.error && <ErrorNotice message="Schedule history could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} />}
    {open && history.data?.rows.length === 0 && <p className="field-hint">No schedule changes have been recorded.</p>}
    {history.data?.rows.length ? <ol>{history.data.rows.map((change) => <li key={change.id}><span><strong>Updated {formatDateTime(change.created_at)}</strong></span><small>Previously: {change.previous_location} · {formatDateTime(change.previous_starts_at)} to {formatDateTime(change.previous_ends_at)}</small><small>Now: {change.new_location} · {formatDateTime(change.new_starts_at)} to {formatDateTime(change.new_ends_at)}</small><small>Reason: {change.reason}</small></li>)}</ol> : null}
    {open && totalPages > 1 && <div className="finance-review-actions" aria-label="Schedule history pages"><span className="field-hint">Page {page + 1} of {totalPages}</span><button type="button" className="button outline" disabled={page === 0 || history.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={15} />Previous</button><button type="button" className="button outline" disabled={page + 1 >= totalPages || history.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></div>}
  </details>
}

function HealthCampaignNotificationReach({ tenantId, campaignId }: { tenantId: string; campaignId: string }) {
  const [open, setOpen] = useState(false)
  const summary = useQuery({ queryKey: ['health-outreach-notification-summary', tenantId, campaignId], queryFn: () => getHealthCampaignNotificationSummary(tenantId, campaignId), enabled: open, staleTime: 15_000 })
  const rows = [
    { label: 'Publication', sent: summary.data?.publication_sent, read: summary.data?.publication_read },
    { label: 'Schedule updates', sent: summary.data?.schedule_update_sent, read: summary.data?.schedule_update_read },
    { label: 'Cancellation', sent: summary.data?.cancellation_sent, read: summary.data?.cancellation_read },
    { label: 'Completion', sent: summary.data?.completion_sent, read: summary.data?.completion_read },
  ]
  return <details className="sk-event-audit sk-event-reach" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Notification reach</summary>
    {open && summary.isPending && <p className="field-hint" role="status">Loading notification counts…</p>}
    {open && summary.error && <ErrorNotice message="Notification counts could not be loaded." onRetry={() => void summary.refetch()} retrying={summary.isFetching} />}
    {open && summary.data && <>
      <div className="sk-event-reach-grid">{rows.map((row) => <div className="sk-event-reach-item" key={row.label}><strong>{row.label}</strong><span>{(row.sent ?? 0).toLocaleString()} notified · {(row.read ?? 0).toLocaleString()} marked read</span></div>)}</div>
      <p className="field-hint">Counts show in-app notice delivery to opted-in accounts and read status only. They do not identify members or indicate attendance.</p>
    </>}
  </details>
}

export function HealthOutreachPage({ focusId, focusPage, focusStatus, onFocusHandled }: { focusId?: string; focusPage?: number; focusStatus?: 'draft' | 'changes_requested' | 'published' | 'cancelled' | 'completed'; onFocusHandled?: () => void }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | HealthCampaign['status']>('all')
  const [startsFrom, setStartsFrom] = useState('')
  const [startsThrough, setStartsThrough] = useState('')
  const dateRangeInvalid = Boolean(startsFrom && startsThrough && startsFrom > startsThrough)
  const dateWindow = { startsAfter: getManilaDateBoundary(startsFrom), startsBefore: getManilaDateBoundary(startsThrough, 1) }
  useEffect(() => { setPage(0); setSearchInput(''); setSearch(''); setStatusFilter('all'); setStartsFrom(''); setStartsThrough('') }, [tenantId])
  useEffect(() => {
    if (!focusId && !focusStatus) return
    const todayInManila = getManilaDateInputValue()
    setPage(focusPage ?? 0); setSearchInput(''); setSearch(''); setStatusFilter(focusStatus ?? 'cancelled'); setStartsFrom(!focusId && focusStatus === 'published' ? todayInManila : ''); setStartsThrough('')
    if (!focusId) onFocusHandled?.()
  }, [focusId, focusPage, focusStatus, onFocusHandled])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchInput])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'health.campaign.manage'], queryFn: () => hasPermission(tenantId, 'health.campaign.manage'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'health.campaign.review'], queryFn: () => hasPermission(tenantId, 'health.campaign.review'), enabled: Boolean(tenantId) })
  const campaigns = useQuery({ queryKey: ['health-outreach-campaigns', tenantId, page, search, statusFilter, startsFrom, startsThrough], queryFn: () => listHealthCampaigns(tenantId, page, search, statusFilter, dateWindow), enabled: Boolean(tenantId) && !dateRangeInvalid })
  const summary = useQuery({ queryKey: ['health-outreach-summary', tenantId, search, statusFilter, startsFrom, startsThrough], queryFn: () => getHealthCampaignSummary(tenantId, search, statusFilter, dateWindow), enabled: Boolean(tenantId) && !dateRangeInvalid, staleTime: 30_000 })
  const [historyCampaignId, setHistoryCampaignId] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(0)
  const history = useQuery({ queryKey: ['health-outreach-history', tenantId, historyCampaignId, historyPage], queryFn: () => listHealthCampaignEvents(tenantId, historyCampaignId!, historyPage), enabled: Boolean(tenantId && historyCampaignId && (canManage.data || canReview.data)) })
  useEffect(() => {
    if (!campaigns.isPending && !campaigns.isError && page > 0 && campaigns.data?.rows.length === 0) setPage((current) => Math.max(0, current - 1))
  }, [campaigns.data?.rows.length, campaigns.isError, campaigns.isPending, page])
  useEffect(() => {
    if (!focusId || !campaigns.data?.rows.some((campaign) => campaign.id === focusId)) return
    document.getElementById(`health-campaign-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    onFocusHandled?.()
  }, [campaigns.data?.rows, focusId, onFocusHandled])
  const totalPages = Math.ceil((campaigns.data?.totalCount ?? 0) / HEALTH_CAMPAIGN_PAGE_SIZE)
  const minimumCampaignStart = toDateTimeInput(new Date(Date.now() + 60_000).toISOString())
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [completionCampaignId, setCompletionCampaignId] = useState<string | null>(null)
  const [attendanceCount, setAttendanceCount] = useState('0')
  const [completionReason, setCompletionReason] = useState('')
  const [attendanceCorrectionCampaignId, setAttendanceCorrectionCampaignId] = useState<string | null>(null)
  const [correctedAttendanceCount, setCorrectedAttendanceCount] = useState('')
  const [attendanceCorrectionReason, setAttendanceCorrectionReason] = useState('')
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [cancellationCampaignId, setCancellationCampaignId] = useState<string | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [reschedulingCampaignId, setReschedulingCampaignId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const canAccess = canManage.data || canReview.data

  async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: ['health-outreach-campaigns', tenantId] }), queryClient.invalidateQueries({ queryKey: ['health-outreach-summary', tenantId] }), queryClient.invalidateQueries({ queryKey: ['health-outreach-history', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-calendar', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-calendar-preview', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-notifications', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-notification-unread-count', tenantId] })]) }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = campaignSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the campaign details.'); return }
    const startsAt = new Date(parsed.data.starts), endsAt = new Date(parsed.data.ends)
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date() || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError('Choose a future start time and an end time after the start.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await createHealthCampaign({ barangayId: tenantId, title: parsed.data.title, description: parsed.data.description, location: parsed.data.location, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })
      await refresh(); form.reset(); setShowForm(false); setMessage('Outreach schedule sent for Captain review.')
    } catch { setError('Unable to create the outreach schedule. Check the details and try again.') }
    finally { setBusy(false) }
  }
  async function act(campaign: HealthCampaign, action: 'approve' | 'reject') {
    let note: string | null = null
    if (action === 'approve' && new Date(campaign.starts_at) <= new Date()) { setError('This schedule has already started. Return it to the creator so they can choose a future date before publishing.'); return }
    if (action === 'reject') {
      note = window.prompt('Reason for returning this schedule (3–1000 characters):')?.trim() ?? ''
      if (note.length < 3 || note.length > 1000) return
    }
    setBusy(true); setError(''); setMessage('')
    try {
      await reviewHealthCampaign(campaign.id, action === 'approve', note)
      await refresh(); setMessage(action === 'approve' ? 'Outreach schedule published.' : 'Schedule returned with a reason.')
    } catch { setError('Unable to update this schedule. Refresh and try again.') }
    finally { setBusy(false) }
  }

  async function complete(campaign: HealthCampaign, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const count = Number(attendanceCount)
    if (!attendanceCount.trim() || !Number.isInteger(count) || count < 0 || count > 1000000) { setError('Enter a whole number between 0 and 1,000,000.'); return }
    const early = new Date(campaign.ends_at).getTime() > Date.now()
    const reason = completionReason.trim()
    if (early && new Date(campaign.starts_at).getTime() > Date.now()) { setError('An outreach cannot be completed before it starts.'); return }
    if (early && (reason.length < 3 || reason.length > 1000)) { setError('Enter an early completion reason between 3 and 1,000 characters.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await completeHealthCampaign(campaign.id, count, early ? reason : null)
      await refresh(); setCompletionCampaignId(null); setCompletionReason(''); setMessage(`${early ? 'Outreach completed early' : 'Outreach marked complete'}. Aggregate attendance recorded: ${count.toLocaleString()}.`)
    } catch { setError('Unable to complete this outreach schedule. Refresh and try again.') }
    finally { setBusy(false) }
  }

  async function correctAttendance(campaign: HealthCampaign, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const count = Number(correctedAttendanceCount)
    const reason = attendanceCorrectionReason.trim()
    if (!correctedAttendanceCount.trim() || !Number.isInteger(count) || count < 0 || count > 1000000) { setError('Enter a whole number between 0 and 1,000,000.'); return }
    if (reason.length < 3 || reason.length > 1000) { setError('Enter a correction reason between 3 and 1,000 characters.'); return }
    if (count === campaign.attendance_count) { setError('The corrected count must differ from the current count.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await correctHealthCampaignAttendance(campaign.id, count, reason)
      await refresh(); setAttendanceCorrectionCampaignId(null); setAttendanceCorrectionReason(''); setMessage('Aggregate attendance corrected. The old and new totals and reason were added to staff activity.')
    } catch { setError('Unable to correct the attendance total. Refresh and try again.') }
    finally { setBusy(false) }
  }

  async function edit(campaign: HealthCampaign, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = campaignSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the schedule details.'); return }
    const startsAt = new Date(parsed.data.starts), endsAt = new Date(parsed.data.ends)
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date() || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError('Choose a future start time and an end time after the start.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await updateHealthCampaign({ id: campaign.id, title: parsed.data.title, description: parsed.data.description, location: parsed.data.location, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })
      await refresh(); setEditingCampaignId(null); setMessage('Schedule updated and sent to the Captain for review.')
    } catch { setError('Unable to update this schedule. Check the details and try again.') }
    finally { setBusy(false) }
  }

  async function cancel(campaign: HealthCampaign, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = cancellationReason.trim()
    if (reason.length < 3 || reason.length > 1000) { setError('Enter a cancellation reason between 3 and 1,000 characters.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await cancelHealthCampaign(campaign.id, reason)
      await refresh(); setCancellationCampaignId(null); setCancellationReason(''); setMessage('Outreach schedule cancelled. Members can see the cancellation reason.')
    } catch { setError('Unable to cancel this schedule. Refresh and try again.') }
    finally { setBusy(false) }
  }

  async function reschedule(campaign: HealthCampaign, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = rescheduleSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the updated schedule and reason.'); return }
    const startsAt = new Date(parsed.data.starts), endsAt = new Date(parsed.data.ends)
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date() || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError('Choose a future start time and an end time after the start.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await rescheduleHealthCampaign({ id: campaign.id, location: parsed.data.location, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason: parsed.data.reason })
      setReschedulingCampaignId(null); await refresh(); setMessage('Outreach schedule updated. Opted-in community members have been notified.')
    } catch { setError('Unable to reschedule this outreach. Check the details and try again.') }
    finally { setBusy(false) }
  }

  function toDateTimeInput(value: string) {
    const date = new Date(value)
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
    return date.toISOString().slice(0, 16)
  }

  async function exportSchedules() {
    setExporting(true); setExportError('')
    try {
      const rows = await listAllHealthCampaigns(tenantId, search, statusFilter, dateWindow)
      const csv = encodeCsv([
        ['Title', 'Location', 'Starts', 'Ends', 'Status', 'Aggregate attendance'],
        ...rows.map((campaign) => [campaign.title, campaign.location, formatDateTime(campaign.starts_at), formatDateTime(campaign.ends_at), campaign.status, campaign.attendance_count ?? '']),
      ])
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `kabalikat-health-outreach-${statusFilter}-${getManilaDateInputValue()}.csv`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setExportError('Unable to export all matching outreach schedules. Please try again.') }
    finally { setExporting(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Health outreach" description="Plan community health outreach events and share approved schedules with residents.">
      <button type="button" className="button outline" onClick={() => void exportSchedules()} disabled={!campaigns.data?.totalCount || exporting || dateRangeInvalid}><Download size={16} />{exporting ? 'Preparing export…' : 'Export matching CSV'}</button>
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}><CalendarHeart size={16} />Plan outreach</button>}
    </PageHeading>
    <div className="ops-panel referral-privacy-notice"><ShieldAlert size={18} /><p><strong>Scheduling and aggregate counts only.</strong> This page does not store patient records, register participants, provide medical advice, or contact emergency services. Completion records only a total attendance number; do not enter names or personal health information.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view published outreach schedules." />}
    {Boolean(tenantId) && (canManage.isPending || canReview.isPending) && <LoadingNotice compact />}
    {(canManage.error || canReview.error) && <ErrorNotice message="Outreach management or review access could not be checked. Published schedules remain available; staff controls are hidden until access can be verified." onRetry={() => { void canManage.refetch(); void canReview.refetch() }} retrying={canManage.isFetching || canReview.isFetching} />}
    {message && <div className="ops-success" role="status"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canAccess && !canManage.isPending && !canReview.isPending && !canManage.error && !canReview.error && <div className="ops-panel archive-access"><CalendarHeart size={20} /><div><strong>Outreach schedule access</strong><p>Residents and other active members can view published schedules. BHWs can propose schedules; Captains review them.</p></div></div>}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>Plan a community outreach event</h2><p>New schedules stay private until reviewed by a Captain.</p></div><CalendarHeart size={19} /></div>
      <div className="ops-form-grid"><label>Event title<input name="title" minLength={3} maxLength={180} required placeholder="Community health outreach" /></label><label>Location<input name="location" minLength={2} maxLength={240} required placeholder="Venue or meeting point" /></label><label>Starts<input name="starts" type="datetime-local" min={minimumCampaignStart} required /></label><label>Ends<input name="ends" type="datetime-local" required /></label><label className="span-two">Public event details<textarea name="description" maxLength={2000} placeholder="Share logistics and general event information. Do not include participant or patient information." /></label></div>
      <div className="ops-form-actions"><button className="button primary" disabled={busy}>Submit for review</button></div>
    </form>}
    {Boolean(tenantId) && <div className="health-outreach-filters">
      <label className="archive-search"><Search size={16} /><input type="search" aria-label="Search outreach schedules" maxLength={100} placeholder="Search title, location, or details" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
      <label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(0) }}><option value="all">All statuses</option><option value="draft">Awaiting review</option><option value="changes_requested">Changes requested</option><option value="published">Published</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      <label>Starts from<input type="date" value={startsFrom} max={startsThrough || undefined} onChange={(event) => { setStartsFrom(event.target.value); setPage(0) }} /></label>
      <label>Starts through<input type="date" value={startsThrough} min={startsFrom || undefined} onChange={(event) => { setStartsThrough(event.target.value); setPage(0) }} /></label>
    </div>}
    {dateRangeInvalid && <ErrorNotice message="The start date must be on or before the end date." />}
    {summary.error && <ErrorNotice message="Unable to load the aggregate outreach summary." onRetry={() => void summary.refetch()} retrying={summary.isFetching} />}
    {exportError && <ErrorNotice message={exportError} />}
    {summary.data && <section className="health-outreach-summary" aria-label="Outreach schedule overview">
      <article className="ops-panel"><span>Matching schedules</span><strong>{summary.data.totalCount.toLocaleString()}</strong></article>
      <button type="button" className="ops-panel health-outreach-summary-action" aria-label={`Show ${summary.data.awaitingReviewCount} schedules awaiting review`} onClick={() => { setPage(0); setStatusFilter('draft') }}><span>Awaiting review</span><strong>{summary.data.awaitingReviewCount.toLocaleString()}</strong><small>View review queue</small></button>
      <button type="button" className="ops-panel health-outreach-summary-action" aria-label={`Show ${summary.data.changesRequestedCount} schedules with changes requested`} onClick={() => { setPage(0); setStatusFilter('changes_requested') }}><span>Changes requested</span><strong>{summary.data.changesRequestedCount.toLocaleString()}</strong><small>View returned schedules</small></button>
      <article className="ops-panel"><span>Completed</span><strong>{summary.data.completedCount.toLocaleString()}</strong></article>
      <article className="ops-panel"><span>Total attendance</span><strong>{summary.data.totalAttendance.toLocaleString()}</strong></article>
    </section>}
    {!dateRangeInvalid && campaigns.isPending && tenantId && <LoadingNotice />}{campaigns.error && <ErrorNotice message="Unable to load outreach schedules." onRetry={() => void campaigns.refetch()} retrying={campaigns.isFetching} />}
    {campaigns.data?.totalCount === 0 && <div className="ops-empty"><CalendarHeart size={22} /><strong>{search || statusFilter !== 'all' || startsFrom || startsThrough ? 'No matching outreach schedules' : 'No outreach schedules yet'}</strong><p>{search || statusFilter !== 'all' || startsFrom || startsThrough ? 'Try another search, status, or date range.' : 'Published community events will appear here.'}</p></div>}
    <div className="referral-list">{campaigns.data?.rows.map((campaign) => <article id={`health-campaign-${campaign.id}`} className={`ops-panel referral-card ${campaign.id === focusId ? 'health-campaign-focused' : ''}`} key={campaign.id}>
      <div className="referral-card-head"><div><h2>{campaign.title}</h2><p><MapPin size={14} />{campaign.location}</p></div><StatusPill status={campaign.status} /></div>
      {campaign.description && <p className="referral-summary">{campaign.description}</p>}
      <div className="referral-meta"><span><strong>Starts</strong>{formatDateTime(campaign.starts_at)}</span><span><strong>Ends</strong>{formatDateTime(campaign.ends_at)}</span></div>
      {campaign.review_note && <p className="field-hint">{campaign.status === 'changes_requested' ? 'Captain feedback: ' : 'Review note: '}{campaign.review_note}</p>}
      {campaign.status === 'cancelled' && campaign.cancellation_reason && <p className="field-hint"><strong>Cancellation reason:</strong> {campaign.cancellation_reason}</p>}
      {campaign.status === 'completed' && campaign.attendance_count !== null && <p className="field-hint"><strong>Community members reached:</strong> {campaign.attendance_count.toLocaleString()}</p>}
      {canManage.data && campaign.status === 'completed' && <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy} onClick={() => { setCorrectedAttendanceCount(String(campaign.attendance_count ?? '')); setAttendanceCorrectionReason(''); setAttendanceCorrectionCampaignId((current) => current === campaign.id ? null : campaign.id) }}>{attendanceCorrectionCampaignId === campaign.id ? 'Close correction' : 'Correct attendance total'}</button></div>}
      {attendanceCorrectionCampaignId === campaign.id && <form className="ops-panel ops-form health-campaign-editor" onSubmit={(event) => void correctAttendance(campaign, event)}><div className="ops-form-grid"><label>Corrected aggregate attendance<input type="number" min="0" max="1000000" step="1" value={correctedAttendanceCount} onChange={(event) => setCorrectedAttendanceCount(event.target.value)} required /><span className="field-hint">Enter only the corrected total. Do not enter names or health information.</span></label><label className="span-two">Correction reason<textarea value={attendanceCorrectionReason} minLength={3} maxLength={1000} onChange={(event) => setAttendanceCorrectionReason(event.target.value)} required placeholder="Explain why the total is being corrected. Do not include participant or patient details." /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Save corrected total</button><button type="button" className="button outline" disabled={busy} onClick={() => setAttendanceCorrectionCampaignId(null)}>Cancel</button></div></form>}
      {['published', 'completed', 'cancelled'].includes(campaign.status) && <HealthCampaignScheduleHistory key={campaign.id} tenantId={tenantId} campaignId={campaign.id} />}
      {canManage.data && campaign.created_by === user?.id && ['draft', 'changes_requested'].includes(campaign.status) && <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy} onClick={() => setEditingCampaignId((current) => current === campaign.id ? null : campaign.id)}>{editingCampaignId === campaign.id ? 'Close editor' : campaign.status === 'changes_requested' ? 'Edit and resubmit' : 'Edit draft'}</button></div>}
      {editingCampaignId === campaign.id && <form className="ops-panel ops-form health-campaign-editor" onSubmit={(event) => void edit(campaign, event)}><div className="ops-form-grid"><label>Event title<input name="title" minLength={3} maxLength={180} defaultValue={campaign.title} required /></label><label>Location<input name="location" minLength={2} maxLength={240} defaultValue={campaign.location} required /></label><label>Starts<input name="starts" type="datetime-local" min={minimumCampaignStart} defaultValue={toDateTimeInput(campaign.starts_at)} required /></label><label>Ends<input name="ends" type="datetime-local" defaultValue={toDateTimeInput(campaign.ends_at)} required /></label><label className="span-two">Public event details<textarea name="description" maxLength={2000} defaultValue={campaign.description} placeholder="Do not include participant or patient information." /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>{campaign.status === 'changes_requested' ? 'Resubmit for review' : 'Save draft'}</button><button type="button" className="button outline" disabled={busy} onClick={() => setEditingCampaignId(null)}>Cancel</button></div></form>}
      {canReview.data && ['draft', 'changes_requested'].includes(campaign.status) && <><div className="ops-form-actions"><button className="button primary" disabled={busy || campaign.created_by === user?.id} title={campaign.created_by === user?.id ? 'The creator cannot approve their own schedule.' : undefined} onClick={() => void act(campaign, 'approve')}>Publish</button><button className="button outline" disabled={busy || campaign.created_by === user?.id} title={campaign.created_by === user?.id ? 'The creator cannot review their own schedule.' : undefined} onClick={() => void act(campaign, 'reject')}>Request changes</button></div>{campaign.created_by === user?.id && <small className="field-hint">Another authorized manager must review this schedule.</small>}</>}
      {(canManage.data || canReview.data) && campaign.status === 'published' && new Date(campaign.ends_at).getTime() > Date.now() && <>{cancellationCampaignId === campaign.id
        ? <form className="ops-panel ops-form health-campaign-editor" onSubmit={(event) => void cancel(campaign, event)}><label>Reason for cancellation<textarea value={cancellationReason} minLength={3} maxLength={1000} onChange={(event) => setCancellationReason(event.target.value)} required placeholder="Explain why this public outreach schedule was cancelled." /></label><span className="field-hint">This reason will be visible to active barangay members.</span><div className="ops-form-actions"><button className="button primary" disabled={busy}>Confirm cancellation</button><button type="button" className="button outline" disabled={busy} onClick={() => { setCancellationCampaignId(null); setCancellationReason('') }}>Keep schedule</button></div></form>
        : <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy} onClick={() => setCancellationCampaignId(campaign.id)}>Cancel public schedule</button></div>}</>}
      {(canManage.data || canReview.data) && campaign.status === 'published' && new Date(campaign.ends_at).getTime() > Date.now() && <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy} onClick={() => setReschedulingCampaignId((current) => current === campaign.id ? null : campaign.id)}>{reschedulingCampaignId === campaign.id ? 'Close rescheduler' : 'Reschedule outreach'}</button></div>}
      {reschedulingCampaignId === campaign.id && <form className="ops-panel ops-form health-campaign-editor" onSubmit={(event) => void reschedule(campaign, event)}><div className="ops-panel-heading"><div><h3>Update published schedule</h3><p>Members who allow health outreach updates will be notified of the revised time or location.</p></div><CalendarDays size={18} /></div><div className="ops-form-grid"><label>New location<input name="location" minLength={2} maxLength={240} defaultValue={campaign.location} required /></label><label>New start<input name="starts" type="datetime-local" min={minimumCampaignStart} defaultValue={toDateTimeInput(campaign.starts_at)} required /></label><label>New end<input name="ends" type="datetime-local" defaultValue={toDateTimeInput(campaign.ends_at)} required /></label><label className="span-two">Public reason for change<textarea name="reason" minLength={3} maxLength={1000} required placeholder="Explain the schedule change without names or private health details." /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Save and notify</button><button type="button" className="button outline" disabled={busy} onClick={() => setReschedulingCampaignId(null)}>Cancel</button></div></form>}
      {(canManage.data || canReview.data) && <div className="health-campaign-history">
        <button type="button" className="button outline" aria-expanded={historyCampaignId === campaign.id} onClick={() => { if (historyCampaignId === campaign.id) setHistoryCampaignId(null); else { setHistoryCampaignId(campaign.id); setHistoryPage(0) } }}><History size={16} />{historyCampaignId === campaign.id ? 'Hide staff activity' : 'View staff activity'}</button>
        {historyCampaignId === campaign.id && <section className="health-campaign-history-panel" aria-label={`Staff activity for ${campaign.title}`}>
          {history.isPending && <LoadingNotice compact />}
          {history.error && <ErrorNotice message="Unable to load the staff activity history." onRetry={() => void history.refetch()} retrying={history.isFetching} />}
          {history.data?.rows.length === 0 && <p className="field-hint">No staff activity recorded.</p>}
          {history.data?.rows.map((event) => <article className="health-campaign-history-event" key={event.id}>
            <div><strong>{campaignEventLabels[event.action] ?? 'Schedule activity'}</strong><span>By {event.actor_name}</span></div>
            <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
            {event.note && <p>{event.action === 'campaign_rejected' || event.action === 'campaign_cancelled' ? `Reason: ${event.note}` : event.note}</p>}
          </article>)}
          {history.data && history.data.totalCount > HEALTH_CAMPAIGN_EVENT_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Staff activity pages"><span className="muted">Page {historyPage + 1} of {Math.ceil(history.data.totalCount / HEALTH_CAMPAIGN_EVENT_PAGE_SIZE)}</span><div className="finance-review-actions"><button type="button" className="button outline" disabled={historyPage === 0 || history.isFetching} onClick={() => setHistoryPage((current) => Math.max(0, current - 1))}><ChevronLeft size={16} />Previous</button><button type="button" className="button outline" disabled={(historyPage + 1) * HEALTH_CAMPAIGN_EVENT_PAGE_SIZE >= history.data.totalCount || history.isFetching} onClick={() => setHistoryPage((current) => current + 1)}>Next<ChevronRight size={16} /></button></div></nav>}
        </section>}
      </div>}
      {canManage.data && ['published', 'completed', 'cancelled'].includes(campaign.status) && <HealthCampaignNotificationReach key={campaign.id} tenantId={tenantId} campaignId={campaign.id} />}
      {canManage.data && campaign.status === 'published' && <>{completionCampaignId === campaign.id
        ? <form className="ops-panel ops-form health-campaign-editor" onSubmit={(event) => void complete(campaign, event)}><div className="ops-form-grid"><label>Aggregate attendance<input type="number" min="0" max="1000000" step="1" value={attendanceCount} onChange={(event) => setAttendanceCount(event.target.value)} required /><span className="field-hint">Record only the total number of people reached. Do not enter names or health information.</span></label>{new Date(campaign.ends_at).getTime() > Date.now() && <label className="span-two">Reason for completing before the scheduled end<textarea value={completionReason} minLength={3} maxLength={1000} onChange={(event) => setCompletionReason(event.target.value)} required placeholder="Explain why this outreach is ending early. Do not include participant or patient details." /></label>}</div><div className="ops-form-actions"><button className="button primary" disabled={busy}>{new Date(campaign.ends_at).getTime() > Date.now() ? 'Complete outreach early' : 'Record and complete'}</button><button type="button" className="button outline" disabled={busy} onClick={() => { setCompletionCampaignId(null); setCompletionReason('') }}>Cancel</button></div></form>
        : <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy || new Date(campaign.starts_at).getTime() > Date.now()} onClick={() => { setAttendanceCount(''); setCompletionReason(''); setCompletionCampaignId(campaign.id) }}>{new Date(campaign.ends_at).getTime() > Date.now() ? 'Complete outreach early' : 'Record attendance and complete'}</button></div>}</>}
    </article>)}</div>
    {totalPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="Outreach schedule pages">
      <span className="muted">Page {page + 1} of {totalPages} - {campaigns.data?.totalCount ?? 0} schedules</span>
      <div className="finance-review-actions">
        <button className="button outline" disabled={page === 0 || campaigns.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button>
        <button className="button outline" disabled={page + 1 >= totalPages || campaigns.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button>
      </div>
    </nav>}
  </section>
}
