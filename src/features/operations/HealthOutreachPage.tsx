import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarHeart, CheckCircle2, ChevronLeft, ChevronRight, Download, History, MapPin, Search, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { cancelHealthCampaign, completeHealthCampaign, createHealthCampaign, getHealthCampaignSummary, HEALTH_CAMPAIGN_EVENT_PAGE_SIZE, HEALTH_CAMPAIGN_PAGE_SIZE, listAllHealthCampaigns, listHealthCampaignEvents, listHealthCampaigns, reviewHealthCampaign, updateHealthCampaign, type HealthCampaign } from './health-outreach-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'
import { encodeCsv } from './csv'

const campaignSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), location: z.string().trim().min(2).max(240), starts: z.string().min(1), ends: z.string().min(1) })

const campaignEventLabels: Record<string, string> = {
  campaign_created: 'Schedule submitted for review',
  campaign_published: 'Captain published the schedule',
  campaign_rejected: 'Captain requested changes',
  campaign_completed: 'Schedule marked complete',
  campaign_updated: 'Draft schedule edited',
  campaign_resubmitted: 'Updated schedule sent for review',
  campaign_cancelled: 'Public schedule cancelled',
}

export function HealthOutreachPage({ focusId, focusPage, focusStatus, onFocusHandled }: { focusId?: string; focusPage?: number; focusStatus?: 'draft' | 'changes_requested' | 'published' | 'cancelled' | 'completed'; onFocusHandled?: () => void }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | HealthCampaign['status']>('all')
  useEffect(() => { setPage(0); setSearchInput(''); setSearch(''); setStatusFilter('all') }, [tenantId])
  useEffect(() => {
    if (!focusId) return
    setPage(focusPage ?? 0); setSearchInput(''); setSearch(''); setStatusFilter(focusStatus ?? 'cancelled')
  }, [focusId, focusPage, focusStatus])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchInput])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'health.campaign.manage'], queryFn: () => hasPermission(tenantId, 'health.campaign.manage'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'health.campaign.review'], queryFn: () => hasPermission(tenantId, 'health.campaign.review'), enabled: Boolean(tenantId) })
  const campaigns = useQuery({ queryKey: ['health-outreach-campaigns', tenantId, page, search, statusFilter], queryFn: () => listHealthCampaigns(tenantId, page, search, statusFilter), enabled: Boolean(tenantId) })
  const summary = useQuery({ queryKey: ['health-outreach-summary', tenantId, search, statusFilter], queryFn: () => getHealthCampaignSummary(tenantId, search, statusFilter), enabled: Boolean(tenantId), staleTime: 30_000 })
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
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [completionCampaignId, setCompletionCampaignId] = useState<string | null>(null)
  const [attendanceCount, setAttendanceCount] = useState('0')
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [cancellationCampaignId, setCancellationCampaignId] = useState<string | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const canAccess = canManage.data || canReview.data

  async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: ['health-outreach-campaigns', tenantId] }), queryClient.invalidateQueries({ queryKey: ['health-outreach-summary', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-calendar', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-calendar-preview', tenantId] })]) }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = campaignSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the campaign details.'); return }
    const startsAt = new Date(parsed.data.starts), endsAt = new Date(parsed.data.ends)
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError('The end time must be after the start time.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await createHealthCampaign({ barangayId: tenantId, title: parsed.data.title, description: parsed.data.description, location: parsed.data.location, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })
      await refresh(); form.reset(); setShowForm(false); setMessage('Outreach schedule sent for Captain review.')
    } catch { setError('Unable to create the outreach schedule. Check the details and try again.') }
    finally { setBusy(false) }
  }
  async function act(campaign: HealthCampaign, action: 'approve' | 'reject') {
    let note: string | null = null
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
    setBusy(true); setError(''); setMessage('')
    try {
      await completeHealthCampaign(campaign.id, count)
      await refresh(); setCompletionCampaignId(null); setMessage(`Outreach marked complete. Aggregate attendance recorded: ${count.toLocaleString()}.`)
    } catch { setError('Unable to complete this outreach schedule. Refresh and try again.') }
    finally { setBusy(false) }
  }

  async function edit(campaign: HealthCampaign, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = campaignSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the schedule details.'); return }
    const startsAt = new Date(parsed.data.starts), endsAt = new Date(parsed.data.ends)
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError('The end time must be after the start time.'); return }
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

  function toDateTimeInput(value: string) {
    const date = new Date(value)
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
    return date.toISOString().slice(0, 16)
  }

  async function exportSchedules() {
    setExporting(true); setExportError('')
    try {
      const rows = await listAllHealthCampaigns(tenantId, search, statusFilter)
      const csv = encodeCsv([
        ['Title', 'Location', 'Starts', 'Ends', 'Status', 'Aggregate attendance'],
        ...rows.map((campaign) => [campaign.title, campaign.location, formatDateTime(campaign.starts_at), formatDateTime(campaign.ends_at), campaign.status, campaign.attendance_count ?? '']),
      ])
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `kabalikat-health-outreach-${statusFilter}-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setExportError('Unable to export all matching outreach schedules. Please try again.') }
    finally { setExporting(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Health outreach" description="Plan community health outreach events and share approved schedules with residents.">
      <button type="button" className="button outline" onClick={() => void exportSchedules()} disabled={!campaigns.data?.totalCount || exporting}><Download size={16} />{exporting ? 'Preparing export…' : 'Export matching CSV'}</button>
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}><CalendarHeart size={16} />Plan outreach</button>}
    </PageHeading>
    <div className="ops-panel referral-privacy-notice"><ShieldAlert size={18} /><p><strong>Scheduling and aggregate counts only.</strong> This page does not store patient records, register participants, provide medical advice, or contact emergency services. Completion records only a total attendance number; do not enter names or personal health information.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view published outreach schedules." />}
    {Boolean(tenantId) && (canManage.isPending || canReview.isPending) && <LoadingNotice compact />}
    {(canManage.error || canReview.error) && <ErrorNotice message="Outreach management or review access could not be checked. Published schedules remain available; staff controls are hidden until access can be verified." />}
    {message && <div className="ops-success" role="status"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canAccess && !canManage.isPending && !canReview.isPending && !canManage.error && !canReview.error && <div className="ops-panel archive-access"><CalendarHeart size={20} /><div><strong>Outreach schedule access</strong><p>Residents and other active members can view published schedules. BHWs can propose schedules; Captains review them.</p></div></div>}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>Plan a community outreach event</h2><p>New schedules stay private until reviewed by a Captain.</p></div><CalendarHeart size={19} /></div>
      <div className="ops-form-grid"><label>Event title<input name="title" minLength={3} maxLength={180} required placeholder="Community health outreach" /></label><label>Location<input name="location" minLength={2} maxLength={240} required placeholder="Venue or meeting point" /></label><label>Starts<input name="starts" type="datetime-local" required /></label><label>Ends<input name="ends" type="datetime-local" required /></label><label className="span-two">Public event details<textarea name="description" maxLength={2000} placeholder="Share logistics and general event information. Do not include participant or patient information." /></label></div>
      <div className="ops-form-actions"><button className="button primary" disabled={busy}>Submit for review</button></div>
    </form>}
    {Boolean(tenantId) && <div className="health-outreach-filters">
      <label className="archive-search"><Search size={16} /><input type="search" aria-label="Search outreach schedules" maxLength={100} placeholder="Search title, location, or details" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
      <label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(0) }}><option value="all">All statuses</option><option value="draft">Awaiting review</option><option value="changes_requested">Changes requested</option><option value="published">Published</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
    </div>}
    {summary.error && <ErrorNotice message="Unable to load the aggregate outreach summary." onRetry={() => void summary.refetch()} retrying={summary.isFetching} />}
    {exportError && <ErrorNotice message={exportError} />}
    {summary.data && <section className="health-outreach-summary" aria-label="Outreach schedule overview">
      <article className="ops-panel"><span>Matching schedules</span><strong>{summary.data.totalCount.toLocaleString()}</strong></article>
      <button type="button" className="ops-panel health-outreach-summary-action" aria-label={`Show ${summary.data.awaitingReviewCount} schedules awaiting review`} onClick={() => { setPage(0); setStatusFilter('draft') }}><span>Awaiting review</span><strong>{summary.data.awaitingReviewCount.toLocaleString()}</strong><small>View review queue</small></button>
      <button type="button" className="ops-panel health-outreach-summary-action" aria-label={`Show ${summary.data.changesRequestedCount} schedules with changes requested`} onClick={() => { setPage(0); setStatusFilter('changes_requested') }}><span>Changes requested</span><strong>{summary.data.changesRequestedCount.toLocaleString()}</strong><small>View returned schedules</small></button>
      <article className="ops-panel"><span>Completed</span><strong>{summary.data.completedCount.toLocaleString()}</strong></article>
      <article className="ops-panel"><span>Total attendance</span><strong>{summary.data.totalAttendance.toLocaleString()}</strong></article>
    </section>}
    {campaigns.isPending && tenantId && <LoadingNotice />}{campaigns.error && <ErrorNotice message="Unable to load outreach schedules." onRetry={() => void campaigns.refetch()} retrying={campaigns.isFetching} />}
    {campaigns.data?.totalCount === 0 && <div className="ops-empty"><CalendarHeart size={22} /><strong>{search || statusFilter !== 'all' ? 'No matching outreach schedules' : 'No outreach schedules yet'}</strong><p>{search || statusFilter !== 'all' ? 'Try another search or status.' : 'Published community events will appear here.'}</p></div>}
    <div className="referral-list">{campaigns.data?.rows.map((campaign) => <article id={`health-campaign-${campaign.id}`} className={`ops-panel referral-card ${campaign.id === focusId ? 'health-campaign-focused' : ''}`} key={campaign.id}>
      <div className="referral-card-head"><div><h2>{campaign.title}</h2><p><MapPin size={14} />{campaign.location}</p></div><StatusPill status={campaign.status} /></div>
      {campaign.description && <p className="referral-summary">{campaign.description}</p>}
      <div className="referral-meta"><span><strong>Starts</strong>{formatDateTime(campaign.starts_at)}</span><span><strong>Ends</strong>{formatDateTime(campaign.ends_at)}</span></div>
      {campaign.review_note && <p className="field-hint">{campaign.status === 'changes_requested' ? 'Captain feedback: ' : 'Review note: '}{campaign.review_note}</p>}
      {campaign.status === 'cancelled' && campaign.cancellation_reason && <p className="field-hint"><strong>Cancellation reason:</strong> {campaign.cancellation_reason}</p>}
      {campaign.status === 'completed' && campaign.attendance_count !== null && <p className="field-hint"><strong>Community members reached:</strong> {campaign.attendance_count.toLocaleString()}</p>}
      {canManage.data && campaign.created_by === user?.id && ['draft', 'changes_requested'].includes(campaign.status) && <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy} onClick={() => setEditingCampaignId((current) => current === campaign.id ? null : campaign.id)}>{editingCampaignId === campaign.id ? 'Close editor' : campaign.status === 'changes_requested' ? 'Edit and resubmit' : 'Edit draft'}</button></div>}
      {editingCampaignId === campaign.id && <form className="ops-panel ops-form health-campaign-editor" onSubmit={(event) => void edit(campaign, event)}><div className="ops-form-grid"><label>Event title<input name="title" minLength={3} maxLength={180} defaultValue={campaign.title} required /></label><label>Location<input name="location" minLength={2} maxLength={240} defaultValue={campaign.location} required /></label><label>Starts<input name="starts" type="datetime-local" defaultValue={toDateTimeInput(campaign.starts_at)} required /></label><label>Ends<input name="ends" type="datetime-local" defaultValue={toDateTimeInput(campaign.ends_at)} required /></label><label className="span-two">Public event details<textarea name="description" maxLength={2000} defaultValue={campaign.description} placeholder="Do not include participant or patient information." /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>{campaign.status === 'changes_requested' ? 'Resubmit for review' : 'Save draft'}</button><button type="button" className="button outline" disabled={busy} onClick={() => setEditingCampaignId(null)}>Cancel</button></div></form>}
      {canReview.data && ['draft', 'changes_requested'].includes(campaign.status) && <div className="ops-form-actions"><button className="button primary" disabled={busy || campaign.created_by === user?.id} title={campaign.created_by === user?.id ? 'The creator cannot approve their own schedule.' : undefined} onClick={() => void act(campaign, 'approve')}>Publish</button><button className="button outline" disabled={busy} onClick={() => void act(campaign, 'reject')}>Request changes</button></div>}
      {(canManage.data || canReview.data) && campaign.status === 'published' && new Date(campaign.ends_at).getTime() > Date.now() && <>{cancellationCampaignId === campaign.id
        ? <form className="ops-panel ops-form health-campaign-editor" onSubmit={(event) => void cancel(campaign, event)}><label>Reason for cancellation<textarea value={cancellationReason} minLength={3} maxLength={1000} onChange={(event) => setCancellationReason(event.target.value)} required placeholder="Explain why this public outreach schedule was cancelled." /></label><span className="field-hint">This reason will be visible to active barangay members.</span><div className="ops-form-actions"><button className="button primary" disabled={busy}>Confirm cancellation</button><button type="button" className="button outline" disabled={busy} onClick={() => { setCancellationCampaignId(null); setCancellationReason('') }}>Keep schedule</button></div></form>
        : <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy} onClick={() => setCancellationCampaignId(campaign.id)}>Cancel public schedule</button></div>}</>}
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
      {canManage.data && campaign.status === 'published' && new Date(campaign.ends_at).getTime() <= Date.now() && <>{completionCampaignId === campaign.id
        ? <form className="ops-form-actions health-attendance-form" onSubmit={(event) => void complete(campaign, event)}><label>Aggregate attendance<input type="number" min="0" max="1000000" step="1" value={attendanceCount} onChange={(event) => setAttendanceCount(event.target.value)} required /><span className="field-hint">Record only the total number of people reached. Do not enter names or health information.</span></label><button className="button primary" disabled={busy}>Record and complete</button><button type="button" className="button outline" disabled={busy} onClick={() => setCompletionCampaignId(null)}>Cancel</button></form>
        : <div className="ops-form-actions"><button className="button outline" disabled={busy} onClick={() => { setAttendanceCount(''); setCompletionCampaignId(campaign.id) }}>Record attendance and complete</button></div>}</>}
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
