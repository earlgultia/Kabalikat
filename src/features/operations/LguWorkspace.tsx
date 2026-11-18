import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { AlertTriangle, ArrowRight, Building2, ChevronLeft, ChevronRight, ClipboardCheck, RefreshCw, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { ErrorNotice, LoadingNotice, StatusPill } from './shared'
import { formatDateTime } from './format'
import { LguSubscriptionPanel } from './LguSubscriptionPanel'
import { LguMunicipalIncidentReports } from './LguMunicipalIncidentReports'
import { createLguBarangay, createLguCaptainInvitation, getLguIncidentResponseWorkload, LGU_BARANGAY_DIRECTORY_PAGE_SIZE, LGU_INCIDENT_ESCALATION_PAGE_SIZE, listLguBarangays, listLguIncidentEscalationHistory, listLguIncidentEscalations, updateLguIncidentEscalation } from './lgu-data'
import { getLguMonthlySubscription } from './lgu-subscription-data'

const barangaySchema = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(40), captainEmail: z.email() })

function formatElapsedTime(timestamp: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000))
  if (!Number.isFinite(elapsedMinutes)) return formatDateTime(timestamp)
  if (elapsedMinutes < 60) return `${elapsedMinutes} min`
  const hours = Math.floor(elapsedMinutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days} day${days === 1 ? '' : 's'}${remainingHours ? ` ${remainingHours} hr` : ''}`
}

function EscalationHistory({ escalationId }: { escalationId: string }) {
  const [open, setOpen] = useState(false)
  const history = useQuery({ queryKey: ['lgu-incident-escalation-history', escalationId], queryFn: () => listLguIncidentEscalationHistory(escalationId), enabled: open })
  return <details className="incident-history" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Response history{history.data ? ` (${history.data.length})` : ''}</summary>
    {open && history.isPending && <LoadingNotice compact />}
    {history.error && <ErrorNotice message="The response history could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} />}
    {history.data?.length ? <ol>{history.data.map((event) => <li key={event.id}><strong>{event.action.replace('_', ' ')}</strong><span>{event.actor_name} · {formatDateTime(event.created_at)}</span>{event.note && <p>{event.note}</p>}</li>)}</ol> : open && !history.isPending && !history.error ? <p>No response history is available.</p> : null}
  </details>
}

export function LguWorkspace() {
  const { lguMembership, signOut } = useAuth()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('all')
  const [severity, setSeverity] = useState('all')
  const [createdAfter, setCreatedAfter] = useState('')
  const [createdBefore, setCreatedBefore] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [barangaySearch, setBarangaySearch] = useState('')
  const [barangaySearchTerm, setBarangaySearchTerm] = useState('')
  const [needsCaptainOnly, setNeedsCaptainOnly] = useState(false)
  const [barangayPage, setBarangayPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [captainInviteTarget, setCaptainInviteTarget] = useState('')
  const [captainEmails, setCaptainEmails] = useState<Record<string, string>>({})
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({})
  const lgu = lguMembership?.local_government
  const lguSubscription = useQuery({ queryKey: ['lgu-monthly-subscription'], queryFn: getLguMonthlySubscription, enabled: Boolean(lguMembership?.lgu_id), refetchInterval: 60_000, refetchOnWindowFocus: true })
  const lguSubscriptionActive = Boolean(lguSubscription.data?.status === 'active' && new Date(lguSubscription.data.period_ends_at).getTime() > Date.now())
  const incidentResponseWorkload = useQuery({ queryKey: ['lgu-incident-response-workload', lguMembership?.lgu_id], queryFn: getLguIncidentResponseWorkload, enabled: Boolean(lguMembership?.lgu_id && lguSubscriptionActive), refetchInterval: 30_000, refetchIntervalInBackground: false })
  const barangays = useQuery({ queryKey: ['lgu-barangays', lguMembership?.lgu_id, barangayPage, barangaySearchTerm, needsCaptainOnly], queryFn: () => listLguBarangays(barangayPage, barangaySearchTerm, needsCaptainOnly), enabled: Boolean(lguMembership?.lgu_id), refetchInterval: 60_000, refetchIntervalInBackground: false })
  const barangayTotal = Number(barangays.data?.total_count ?? 0)
  const barangayPages = Math.ceil(barangayTotal / LGU_BARANGAY_DIRECTORY_PAGE_SIZE)
  useEffect(() => { if (barangayPage >= barangayPages) setBarangayPage(Math.max(0, barangayPages - 1)) }, [barangayPage, barangayPages])
  const escalations = useQuery({ queryKey: ['lgu-incident-escalations', lguMembership?.lgu_id, status, severity, search, createdAfter, createdBefore, page], queryFn: () => listLguIncidentEscalations(status, page, search, severity, createdAfter, createdBefore), enabled: Boolean(lguMembership?.lgu_id) && lguSubscriptionActive, refetchInterval: 30_000, refetchIntervalInBackground: false })
  const escalationTotal = Number(escalations.data?.total_count ?? 0)
  const escalationPages = Math.ceil(escalationTotal / LGU_INCIDENT_ESCALATION_PAGE_SIZE)
  useEffect(() => { if (page >= escalationPages) setPage(Math.max(0, escalationPages - 1)) }, [escalationPages, page])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setBarangayPage(0); setBarangaySearchTerm(barangaySearch.trim()) }, 250)
    return () => window.clearTimeout(timeout)
  }, [barangaySearch])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setPage(0); setSearch(searchInput.trim()) }, 300)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  async function createBarangay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = barangaySchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    setError(''); setMessage(''); setInviteUrl('')
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the barangay details.'); return }
    if (!lguSubscriptionActive) { setError('Activate the LGU monthly subscription before creating a barangay workspace.'); return }
    setBusy(true)
    try {
      const created = await createLguBarangay(parsed.data)
      const url = new URL('/accept-invitation', window.location.origin)
      url.searchParams.set('token', created.invitation_token)
      setInviteUrl(url.toString())
      setCaptainInviteTarget('')
      setMessage('Barangay created. Send the email-bound Captain invitation link to the invited account.')
      setBarangayPage(0)
      form.reset()
      await queryClient.invalidateQueries({ queryKey: ['lgu-barangays', lguMembership?.lgu_id] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create the barangay workspace.') }
    finally { setBusy(false) }
  }

  async function updateEscalation(id: string, nextStatus: 'acknowledged' | 'resolved') {
    const note = responseDrafts[id]?.trim() ?? ''
    if (note.length < 3 || note.length > 1000) { setError('Add a response note between 3 and 1000 characters.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await updateLguIncidentEscalation(id, nextStatus, note)
      setResponseDrafts((current) => ({ ...current, [id]: '' }))
      setMessage(nextStatus === 'acknowledged' ? 'LGU acknowledged the incident report.' : 'LGU response marked complete and sent to the barangay Captain.')
      await queryClient.invalidateQueries({ queryKey: ['lgu-incident-escalation-history', id] })
      await queryClient.invalidateQueries({ queryKey: ['lgu-incident-escalations', lguMembership?.lgu_id] })
      await queryClient.invalidateQueries({ queryKey: ['lgu-incident-response-workload', lguMembership?.lgu_id] })
      await queryClient.invalidateQueries({ queryKey: ['lgu-municipal-incident-summary', lguMembership?.lgu_id] })
      await queryClient.invalidateQueries({ queryKey: ['lgu-municipal-incident-reports', lguMembership?.lgu_id] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the municipal response.') }
    finally { setBusy(false) }
  }

  function openPendingEscalations() {
    setStatus('pending')
    setSeverity('all')
    setCreatedAfter('')
    setCreatedBefore('')
    setSearchInput('')
    setSearch('')
    setPage(0)
    window.requestAnimationFrame(() => document.getElementById('lgu-escalations-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteUrl); setMessage('Captain invitation link copied.') }
    catch { setError('Clipboard access is unavailable. Select and copy the invitation link.') }
  }

  async function issueCaptainInvite(barangayId: string, event: FormEvent<HTMLFormElement>, replacingPending = false) {
    event.preventDefault()
    setError(''); setMessage(''); setInviteUrl('')
    const email = captainEmails[barangayId]?.trim() ?? ''
    if (!z.email().safeParse(email).success) { setError('Enter a valid Captain email address.'); return }
    if (!lguSubscriptionActive) { setError('Activate the LGU monthly subscription before inviting a Captain.'); return }
    setBusy(true)
    try {
      const invitation = await createLguCaptainInvitation(barangayId, email)
      const url = new URL('/accept-invitation', window.location.origin)
      url.searchParams.set('token', invitation.invitation_token)
      setInviteUrl(url.toString()); setCaptainInviteTarget(barangayId)
      setMessage(replacingPending
        ? `Replacement Captain invitation created; the previous pending link is invalidated. It expires ${formatDateTime(invitation.expires_at)}.`
        : `Captain invitation created. It expires ${formatDateTime(invitation.expires_at)}.`)
      await queryClient.invalidateQueries({ queryKey: ['lgu-barangays', lguMembership?.lgu_id] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create the Captain invitation.') }
    finally { setBusy(false) }
  }

  return <main className="lgu-workspace">
    <header className="lgu-workspace-header"><div><div className="eyebrow">MUNICIPALITY WORKSPACE</div><h1>{lgu?.municipality ?? 'LGU'} LGU</h1><p>{lgu?.province} · Manage barangay onboarding and reports escalated by Captains.</p></div><div className="lgu-workspace-actions"><span className="role-pill"><ShieldCheck size={15} /> LGU administrator</span><button type="button" className="button outline" onClick={() => void signOut()}>Sign out</button></div></header>
    {error && <ErrorNotice message={error} />}{message && <div className="ops-success" role="status"><ClipboardCheck size={16} />{message}</div>}

    <LguSubscriptionPanel />
    {lguSubscription.isSuccess && !lguSubscriptionActive && <div className="error-banner" role="status">Activate or renew the LGU monthly subscription to create barangay workspaces, issue Captain invitations, and open municipality incident reports. Your barangay directory and subscription requests remain available.</div>}

    <section className="captain-review-queue lgu-overview" aria-labelledby="lgu-overview-title">
      <div className="section-heading"><div><h2 id="lgu-overview-title">Municipal overview</h2><p>Current workload for {lgu?.municipality ?? 'this municipality'}.</p></div><span className="role-pill">Municipality scope</span></div>
      <div className="dashboard-metrics captain-review-metrics" aria-label="Municipal workspace totals">
        <button type="button" className="dashboard-metric" aria-label={`${barangays.isPending ? 'Loading' : barangays.error ? 'Unavailable' : barangayTotal.toLocaleString()} barangay workspaces. Open the barangay directory.`} onClick={() => document.getElementById('lgu-barangays-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span className="dashboard-metric-icon blue"><Building2 size={19} /></span><span><small>Barangay workspaces</small><strong>{barangays.isPending ? '…' : barangays.error ? 'Unavailable' : barangayTotal.toLocaleString()}</strong></span><ArrowRight size={16} /></button>
        {lguSubscriptionActive && incidentResponseWorkload.isPending && <div className="lgu-overview-feedback"><LoadingNotice compact /></div>}
        {lguSubscriptionActive && incidentResponseWorkload.error && <div className="lgu-overview-feedback"><ErrorNotice message="Municipal workload totals could not be loaded." onRetry={() => void incidentResponseWorkload.refetch()} retrying={incidentResponseWorkload.isFetching} /></div>}
        {incidentResponseWorkload.data && <button type="button" className="dashboard-metric" aria-label={`${incidentResponseWorkload.data.pending_escalations.toLocaleString()} escalated incidents await acknowledgment. Open the response queue.`} onClick={openPendingEscalations}><span className="dashboard-metric-icon orange"><AlertTriangle size={19} /></span><span><small>Escalations awaiting response</small><strong>{incidentResponseWorkload.data.pending_escalations.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
        {incidentResponseWorkload.data && <button type="button" className="dashboard-metric" aria-label={`${incidentResponseWorkload.data.high_priority_pending.toLocaleString()} high or urgent escalations await a municipal response. Open the LGU response queue.`} onClick={openPendingEscalations}><span className="dashboard-metric-icon violet"><ShieldCheck size={19} /></span><span><small>High priority awaiting response</small><strong>{incidentResponseWorkload.data.high_priority_pending.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
      </div>
    </section>

    <section className="ops-panel ops-form" aria-labelledby="lgu-new-barangay-title"><div className="ops-panel-heading"><div><h2 id="lgu-new-barangay-title">Create a barangay workspace</h2><p>Each workspace is linked to {lgu?.municipality}. The first Captain accepts a private invitation before access is activated.</p></div><Building2 size={19} /></div>
      <form className="ops-form-grid" onSubmit={(event) => void createBarangay(event)}><label>Barangay name<input name="name" required maxLength={120} disabled={!lguSubscriptionActive} /></label><label>Unique barangay code<input name="code" required maxLength={40} disabled={!lguSubscriptionActive} /></label><label className="span-two">First Captain email<input name="captainEmail" type="email" required autoComplete="email" disabled={!lguSubscriptionActive} /></label><div className="span-two ops-form-actions"><span className="field-hint">The invitation is valid for seven days. No email is sent automatically.</span><button className="button primary" disabled={busy || !lguSubscriptionActive}>{busy ? 'Creating…' : 'Create barangay and Captain invite'}</button></div></form>
      {inviteUrl && <div className="invite-link-box"><label>Captain invitation link<input readOnly value={inviteUrl} /></label><button type="button" className="button outline" onClick={() => void copyInvite()}><ClipboardCheck size={15} />Copy link</button></div>}
    </section>

    <section className="ops-panel" aria-labelledby="lgu-barangays-title"><div className="ops-panel-heading"><div><h2 id="lgu-barangays-title">Barangay workspaces</h2><p>{barangays.data ? `${barangayTotal.toLocaleString()} barangay${barangayTotal === 1 ? '' : 's'} registered in ${lgu?.municipality ?? 'this municipality'}. The list is limited to this LGU.` : `Workspace directory and active account totals for ${lgu?.municipality ?? 'this municipality'}.`}</p></div><div className="lgu-barangay-tools"><label className="lgu-barangay-search">Search workspaces<input type="search" value={barangaySearch} maxLength={160} onChange={(event) => { setBarangaySearch(event.target.value); setBarangayPage(0) }} placeholder="Barangay name or code" /></label><button type="button" className={`button ${needsCaptainOnly ? 'primary' : 'outline'}`} aria-pressed={needsCaptainOnly} onClick={() => { setNeedsCaptainOnly((value) => !value); setBarangayPage(0) }}>Needs Captain</button><button type="button" className="button outline" disabled={barangays.isFetching} onClick={() => void barangays.refetch()}><RefreshCw size={15} />Refresh</button></div></div>
      {barangays.isPending ? <LoadingNotice /> : barangays.error ? <ErrorNotice message="Barangay workspaces could not be loaded." onRetry={() => void barangays.refetch()} retrying={barangays.isFetching} /> : barangayTotal > 0 ? barangays.data?.rows.length ? <div className="lgu-barangay-list">{barangays.data.rows.map((item) => <article className="lgu-barangay-card" key={item.id}><div><strong>{item.name}</strong><span>{item.code}</span></div><StatusPill status={item.status} /><small>{Number(item.active_members).toLocaleString()} active members</small>{item.captain_active ? <span className="field-hint">Captain accepted</span> : item.status !== 'active' ? <span className="field-hint">Captain invitation unavailable while this workspace is {item.status}.</span> : <><span className="field-hint">{item.pending_captain_email ? <>Invitation pending for {item.pending_captain_email}{item.pending_captain_invite_expires_at ? ` · expires ${formatDateTime(item.pending_captain_invite_expires_at)}` : ''}.</> : 'No Captain invitation is pending.'}</span><form className="lgu-captain-invite" onSubmit={(event) => void issueCaptainInvite(item.id, event, Boolean(item.pending_captain_email))}><label>Captain email<input type="email" autoComplete="email" required disabled={!lguSubscriptionActive} value={captainEmails[item.id] ?? item.pending_captain_email ?? ''} onChange={(event) => setCaptainEmails((current) => ({ ...current, [item.id]: event.target.value }))} /></label><button type="submit" className="button outline" disabled={busy || !lguSubscriptionActive}>{busy ? 'Preparing…' : item.pending_captain_email ? 'Reissue Captain invitation' : 'Issue Captain invitation'}</button></form></>}{captainInviteTarget === item.id && inviteUrl && <div className="invite-link-box"><label>Captain invitation link<input readOnly value={inviteUrl} /></label><button type="button" className="button outline" onClick={() => void copyInvite()}><ClipboardCheck size={15} />Copy link</button></div>}</article>)}</div> : null : <div className="ops-empty"><strong>{barangaySearch || needsCaptainOnly ? 'No matching barangay workspaces' : 'No barangay workspaces yet'}</strong><p>{barangaySearch || needsCaptainOnly ? 'Change the search or turn off the Captain filter.' : 'Create a workspace above to invite its Captain.'}</p></div>}
      {barangayPages > 1 && <nav className="directory-pagination" aria-label="Barangay workspace pages"><button type="button" className="button outline" disabled={barangayPage === 0 || barangays.isFetching} onClick={() => setBarangayPage((value) => Math.max(0, value - 1))}><ChevronLeft size={15} />Previous</button><span>Page {barangayPage + 1} of {barangayPages}</span><button type="button" className="button outline" disabled={barangayPage + 1 >= barangayPages || barangays.isFetching} onClick={() => setBarangayPage((value) => value + 1)}>Next<ChevronRight size={15} /></button></nav>}
    </section>

    {lguSubscriptionActive ? <LguMunicipalIncidentReports lguId={lguMembership?.lgu_id ?? ''} onOpenPendingEscalations={openPendingEscalations} /> : <section className="ops-panel"><h2>Municipality incident reports</h2><p>Activate the LGU monthly subscription to view reports from barangays in this municipality.</p></section>}

    <section className="ops-panel" aria-labelledby="lgu-escalations-title"><div className="ops-panel-heading"><div><h2 id="lgu-escalations-title"><AlertTriangle size={19} /> Incident reports escalated by Captains</h2><p>Only reports a Captain explicitly escalates to this municipality appear here. Tanod reports remain in their barangay until escalated.</p></div><div className="lgu-queue-filters"><label>Search reports<input type="search" value={searchInput} maxLength={160} onChange={(event) => setSearchInput(event.target.value)} placeholder="Summary, barangay, category, or location" /></label><label className="lgu-status-filter">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}><option value="all">All</option><option value="pending">Needs acknowledgment</option><option value="acknowledged">Being handled</option><option value="resolved">Completed</option></select></label><label className="lgu-status-filter">Severity<select value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(0) }}><option value="all">All severities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="moderate">Moderate</option><option value="low">Low</option></select></label><label className="lgu-status-filter">Escalated on or after<input type="date" value={createdAfter} max={createdBefore || undefined} onChange={(event) => { setCreatedAfter(event.target.value); setPage(0) }} /></label><label className="lgu-status-filter">Escalated on or before<input type="date" value={createdBefore} min={createdAfter || undefined} onChange={(event) => { setCreatedBefore(event.target.value); setPage(0) }} /></label>{(createdAfter || createdBefore) && <button type="button" className="button outline" onClick={() => { setCreatedAfter(''); setCreatedBefore(''); setPage(0) }}>Clear dates</button>}<button type="button" className="button outline" disabled={escalations.isFetching || incidentResponseWorkload.isFetching || !lguSubscriptionActive} onClick={() => void Promise.all([escalations.refetch(),incidentResponseWorkload.refetch()])}><RefreshCw size={15} />{escalations.isFetching || incidentResponseWorkload.isFetching ? 'Refreshing…' : 'Refresh queue'}</button></div></div>
      {lguSubscriptionActive && incidentResponseWorkload.data && <div className="incident-summary lgu-incident-response-summary" aria-label="Municipal response workload"><button type="button" className="incident-summary-link" aria-pressed={status === 'pending' && severity === 'all'} onClick={() => { setStatus('pending'); setSeverity('all'); setPage(0) }}><strong>{incidentResponseWorkload.data.pending_escalations.toLocaleString()}</strong><span>Awaiting acknowledgment</span></button><button type="button" className="incident-summary-link" aria-pressed={status === 'acknowledged' && severity === 'all'} onClick={() => { setStatus('acknowledged'); setSeverity('all'); setPage(0) }}><strong>{incidentResponseWorkload.data.acknowledged_escalations.toLocaleString()}</strong><span>Being handled</span></button><div><strong>{incidentResponseWorkload.data.high_priority_pending.toLocaleString()}</strong><span>High or urgent awaiting response</span></div><div><strong title={incidentResponseWorkload.data.oldest_pending_at ? formatDateTime(incidentResponseWorkload.data.oldest_pending_at) : undefined}>{incidentResponseWorkload.data.oldest_pending_at ? formatElapsedTime(incidentResponseWorkload.data.oldest_pending_at) : '—'}</strong><span>Oldest pending age</span></div></div>}
      {!lguSubscriptionActive ? <div className="ops-empty"><strong>LGU subscription required</strong><p>Activate a current monthly LGU plan to view and respond to escalated incidents.</p></div> : escalations.isPending ? <LoadingNotice /> : escalations.error ? <ErrorNotice message="Escalated incident reports could not be loaded." onRetry={() => void escalations.refetch()} retrying={escalations.isFetching} /> : escalations.data?.rows.length ? <div className="lgu-escalation-list">{escalations.data.rows.map((item) => <article className="lgu-escalation-card" key={item.id}><header><div><span className={`incident-severity severity-${item.severity}`}>{item.severity}</span><h3>{item.summary}</h3></div><StatusPill status={item.status} /></header><div className="incident-meta"><span>{item.barangay_name}</span><span>{item.category}</span><span>{item.location}</span><span>Barangay report: {item.incident_status.replaceAll('_', ' ')}</span><span>Escalated {formatDateTime(item.created_at)}</span></div><p>{item.details || 'No additional incident details were provided.'}</p><div className="lgu-escalation-reason"><strong>Captain’s reason for escalation</strong><p>{item.escalation_note}</p></div>{item.lgu_response_note && <div className="lgu-escalation-reason"><strong>Latest LGU response</strong><p>{item.lgu_response_note}</p></div>}<EscalationHistory escalationId={item.id} />{item.status !== 'resolved' && <div className="lgu-response-actions"><label>Response note<textarea rows={2} maxLength={1000} value={responseDrafts[item.id] ?? ''} onChange={(event) => setResponseDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Record who is responding, what support is planned, or what follow-up is needed." /></label><div className="finance-review-actions">{item.status === 'pending' ? <button type="button" className="button primary" disabled={busy} onClick={() => void updateEscalation(item.id, 'acknowledged')}>Acknowledge report</button> : <button type="button" className="button outline" disabled={busy} onClick={() => void updateEscalation(item.id, 'resolved')}>Mark LGU response complete</button>}</div></div>}</article>)}</div> : <div className="ops-empty"><AlertTriangle size={22} /><strong>{search || status !== 'all' || severity !== 'all' || createdAfter || createdBefore ? 'No matching incident reports' : 'No escalated incident reports'}</strong><p>{search || status !== 'all' || severity !== 'all' || createdAfter || createdBefore ? 'Try another search or change the status, severity, or date filters.' : 'Captain-escalated incidents for this municipality will appear here.'}</p></div>}
      {escalationPages > 1 && <div className="ops-panel ops-form-actions"><span className="muted">Page {page + 1} of {escalationPages} · {escalationTotal.toLocaleString()} escalated reports</span><div className="finance-review-actions"><button type="button" className="button outline" disabled={page === 0 || escalations.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button><button type="button" className="button outline" disabled={page + 1 >= escalationPages || escalations.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button></div></div>}
    </section>
    <footer className="footer"><span>Private municipal workspace</span><span>Access is limited to authorized LGU administrators</span></footer>
  </main>
}
