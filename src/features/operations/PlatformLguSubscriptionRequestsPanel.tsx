import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, XCircle } from 'lucide-react'
import { ActionConfirmationDialog } from '../../components/ActionConfirmationDialog'
import { ErrorNotice, LoadingNotice, StatusPill } from './shared'
import { formatDateTime } from './format'
import { activateLguMonthlySubscriptionRequest, declineLguMonthlySubscriptionRequest, getPlatformLguSubscriptionSummary, LGU_SUBSCRIPTION_REQUEST_PAGE_SIZE, listPlatformLguSubscriptionRequests, listPlatformLguSubscriptions, listPlatformLguWorkspaceStatusHistory, PLATFORM_LGU_SUBSCRIPTION_PAGE_SIZE, setPlatformLguWorkspaceStatus, type LguSubscriptionRequest } from './lgu-subscription-data'

function getSubscriptionReviewError(error: unknown) {
  const detail = error instanceof Error ? error.message : 'Unable to process this LGU subscription request.'
  const normalized = detail.toLowerCase()

  if (normalized.includes('not authorized') || normalized.includes('permission')) {
    return { message: 'Your current session is not authorized to review subscription requests. Sign out and back in, then confirm the account has Super Admin access.', detail }
  }
  if (normalized.includes('not found') || normalized.includes('already declined') || normalized.includes('no longer pending')) {
    return { message: 'This request has changed since it was loaded. Refresh the request list and review its current status.', detail }
  }
  if (normalized.includes('plan is invalid') || normalized.includes('plan is no longer available')) {
    return { message: 'The plan attached to this request could not be activated. Apply the latest LGU subscription migration and retry.', detail }
  }
  if (normalized.includes('network') || normalized.includes('fetch')) {
    return { message: 'The service could not be reached. Refresh the request list before retrying in case the action already completed.', detail }
  }
  return { message: detail, detail }
}

function PlatformLguWorkspaceStatusHistory({ lguId }: { lguId: string }) {
  const [open, setOpen] = useState(false)
  const history = useQuery({ queryKey: ['platform-lgu-workspace-status-history', lguId], queryFn: () => listPlatformLguWorkspaceStatusHistory(lguId), enabled: open })
  return <details className="lgu-workspace-status-history" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Access history{history.data ? ` (${history.data.length})` : ''}</summary>
    {open && history.isPending && <LoadingNotice compact />}
    {history.error && <ErrorNotice message="LGU workspace access history could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} />}
    {history.data?.length ? <ol>{history.data.map((event) => <li key={event.id}><strong>{event.from_status} → {event.to_status}</strong><span>{event.actor_name} · {formatDateTime(event.created_at)}</span><p>{event.reason}</p></li>)}</ol> : open && !history.isPending && !history.error ? <p>No access changes recorded.</p> : null}
  </details>
}

export function PlatformLguSubscriptionStatusPanel() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState('')
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState<{ lguId: string; municipality: string; status: 'active' | 'suspended' } | null>(null)
  const [busyId, setBusyId] = useState('')
  const [actionError, setActionError] = useState('')
  const summary = useQuery({ queryKey: ['platform-lgu-subscription-summary'], queryFn: getPlatformLguSubscriptionSummary, staleTime: 60_000, refetchInterval: 60_000, refetchIntervalInBackground: false })
  const subscriptions = useQuery({ queryKey: ['platform-lgu-subscriptions', page, search, status], queryFn: () => listPlatformLguSubscriptions(page, search, status), refetchInterval: 60_000, refetchIntervalInBackground: false })
  const pages = Math.max(1, Math.ceil((subscriptions.data?.total ?? 0) / PLATFORM_LGU_SUBSCRIPTION_PAGE_SIZE))
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  async function saveWorkspaceStatus() {
    if (!target) return
    if (reason.trim().length < 3 || reason.trim().length > 1000) {
      setActionError('Enter a reason between 3 and 1000 characters before changing workspace access.')
      return
    }
    setBusyId(target.lguId); setActionError('')
    try {
      await setPlatformLguWorkspaceStatus(target.lguId, target.status, reason)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-lgu-subscriptions'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-lgu-subscription-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-lgu-workspace-status-history', target.lguId] }),
        queryClient.invalidateQueries({ queryKey: ['platform-lgu-directory'] }),
      ])
      setEditingId(''); setReason(''); setTarget(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update LGU workspace access.')
    } finally { setBusyId('') }
  }

  return <section className="ops-panel platform-lgu-subscription-status" aria-labelledby="platform-lgu-subscription-status-title">
    <div className="ops-panel-heading"><div><h2 id="platform-lgu-subscription-status-title">Municipality subscription status</h2><p>Review every onboarded LGU, including expired monthly periods and municipalities with no subscription yet.</p></div><CircleDollarSign size={19} /></div>
    {summary.error && <ErrorNotice message="Municipality subscription totals could not be loaded." onRetry={() => void summary.refetch()} retrying={summary.isFetching} />}
    {actionError && <ErrorNotice message={actionError} />}
    {summary.data && <div className="platform-lgu-subscription-summary" aria-label="Municipality subscription totals">{([
      ['all', 'Municipalities', summary.data.municipality_count], ['active', 'Paid and active', summary.data.active_count],
      ['ending_soon', 'Ending within 7 days', summary.data.ending_soon_count], ['past_due', 'Past due', summary.data.past_due_count],
      ['suspended', 'Suspended plans or workspaces', summary.data.suspended_count], ['no_subscription', 'No subscription', summary.data.no_subscription_count],
    ] as const).map(([filter, label, count]) => <button key={filter} type="button" className={`platform-lgu-summary-card${status === filter ? ' is-selected' : ''}`} aria-pressed={status === filter} onClick={() => { setStatus(filter); setPage(0) }}><strong>{count.toLocaleString()}</strong><span>{label}</span></button>)}</div>}
    <div className="platform-plan-request-filters"><label>Search municipality<input type="search" value={searchInput} maxLength={100} placeholder="Municipality or province" onChange={(event) => { setSearchInput(event.target.value); setPage(0) }} /></label><label>Workspace or subscription status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}><option value="all">All municipalities</option><option value="active">Active</option><option value="ending_soon">Ends within 7 days</option><option value="past_due">Past due</option><option value="suspended">Suspended workspace or plan</option><option value="no_subscription">No subscription</option></select></label><span className="field-hint">{subscriptions.data?.total ?? 0} municipalities</span></div>
    {subscriptions.isPending && <LoadingNotice compact />}
    {subscriptions.error && <ErrorNotice message="Municipality subscription status could not be loaded." onRetry={() => void subscriptions.refetch()} retrying={subscriptions.isFetching} />}
    {subscriptions.data?.total === 0 && !subscriptions.isPending && <p className="field-hint">No municipalities match this filter.</p>}
    {subscriptions.data?.rows.map((row) => <article className="platform-lgu-status-row" key={row.lgu_id}><div><strong>{row.municipality}, {row.province}</strong><small>Workspace: {row.lgu_status}</small></div><div><StatusPill status={row.subscription_status ?? 'no_subscription'} /><small>{row.plan_name ?? 'No plan recorded'}</small></div><div><strong>{row.period_ends_at ? `Paid through ${formatDateTime(row.period_ends_at)}` : 'No paid period'}</strong><small>{row.period_started_at ? `Started ${formatDateTime(row.period_started_at)}` : 'Subscription not activated'}</small></div><div className="platform-lgu-workspace-controls">{editingId === row.lgu_id ? <><label>Reason for {row.lgu_status === 'active' ? 'suspending' : 'restoring'} access<textarea maxLength={1000} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="finance-review-actions"><button type="button" className="button outline" onClick={() => { setEditingId(''); setReason('') }}>Cancel</button><button type="button" className={`button ${row.lgu_status === 'active' ? 'outline danger-action' : 'primary'}`} disabled={reason.trim().length < 3 || Boolean(busyId)} onClick={() => setTarget({ lguId: row.lgu_id, municipality: row.municipality, status: row.lgu_status === 'active' ? 'suspended' : 'active' })}>{row.lgu_status === 'active' ? 'Suspend workspace' : 'Restore workspace'}</button></div></> : <button type="button" className="button outline" disabled={Boolean(busyId)} onClick={() => { setEditingId(row.lgu_id); setReason(''); setActionError('') }}>{row.lgu_status === 'active' ? 'Manage access' : 'Restore access'}</button>}<PlatformLguWorkspaceStatusHistory lguId={row.lgu_id} /></div></article>)}
    {subscriptions.data && pages > 1 && <nav className="directory-pagination" aria-label="Municipality subscription pages"><button type="button" className="button outline" disabled={page === 0 || subscriptions.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={15} />Previous</button><span>Page {page + 1} of {pages}</span><button type="button" className="button outline" disabled={page + 1 >= pages || subscriptions.isFetching} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={15} /></button></nav>}
    {target && <ActionConfirmationDialog title={`${target.status === 'suspended' ? 'Suspend' : 'Restore'} ${target.municipality} workspace access?`} description={target.status === 'suspended' ? 'This suspends the LGU workspace and blocks its members from municipal tools. Its subscription and paid period remain recorded.' : 'This restores LGU workspace access. The subscription must still have an active paid period for subscription-gated operations.'} confirmLabel={target.status === 'suspended' ? 'Suspend workspace' : 'Restore workspace'} busy={busyId === target.lguId} onCancel={() => setTarget(null)} onConfirm={() => void saveWorkspaceStatus()} />}
  </section>
}

export function PlatformLguSubscriptionRequestsPanel({ status, onStatusChange }: { status: string; onStatusChange: (status: string) => void }) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [activationTarget, setActivationTarget] = useState<LguSubscriptionRequest | null>(null)
  const [declineTarget, setDeclineTarget] = useState<LguSubscriptionRequest | null>(null)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [message, setMessage] = useState('')
  const requests = useQuery({ queryKey: ['platform-lgu-subscription-requests', page, status], queryFn: () => listPlatformLguSubscriptionRequests(page, status), refetchInterval: 60_000, refetchIntervalInBackground: false })
  const totalPages = Math.max(1, Math.ceil((requests.data?.total ?? 0) / LGU_SUBSCRIPTION_REQUEST_PAGE_SIZE))

  useEffect(() => { setPage(0) }, [status])

  async function review(requestId: string, decision: 'activate' | 'decline') {
    const note = notes[requestId]?.trim() ?? ''
    if (note.length < 3 || note.length > 950) {
      setError(decision === 'activate' ? 'Record how the monthly payment was confirmed (3 to 950 characters).' : 'Add a decline reason between 3 and 950 characters.')
      return
    }
    setBusyId(requestId); setError(''); setErrorDetail(''); setMessage('')
    try {
      if (decision === 'activate') await activateLguMonthlySubscriptionRequest(requestId, note)
      else await declineLguMonthlySubscriptionRequest(requestId, note)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-lgu-subscription-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-lgu-subscriptions'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-lgu-subscription-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-pending-plan-request-count'] }),
        queryClient.invalidateQueries({ queryKey: ['lgu-monthly-subscription'] }),
        queryClient.invalidateQueries({ queryKey: ['lgu-monthly-subscription-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-activity'] }),
      ])
      setNotes((current) => ({ ...current, [requestId]: '' }))
      setActivationTarget(null); setDeclineTarget(null); onStatusChange(decision === 'activate' ? 'activated' : 'declined'); setPage(0)
      setMessage(decision === 'activate' ? 'Monthly LGU subscription activated for one month.' : 'LGU subscription request declined and the reason recorded.')
    } catch (reviewError) {
      const reviewFailure = getSubscriptionReviewError(reviewError)
      setError(reviewFailure.message)
      setErrorDetail(reviewFailure.detail)
    } finally { setBusyId('') }
  }

  return <section className="platform-plan-requests" aria-labelledby="platform-lgu-subscription-requests-title">
    <div className="ops-panel-heading"><div><h2 id="platform-lgu-subscription-requests-title">LGU monthly subscription requests</h2><p>Review municipality plan requests. Confirm payment manually before activating each one-month period.</p></div><CircleDollarSign size={19} /></div>
    {message && <div className="ops-success" role="status"><CheckCircle2 size={16} />{message}</div>}
    {error && <div className="platform-plan-request-error"><ErrorNotice message={error} userFacingMessage /><details><summary>Action details</summary><p>{errorDetail || error}</p></details></div>}
    <p className="field-hint">{requests.data?.total ?? 0} LGU requests in this status.</p>
    {requests.isPending && <LoadingNotice compact />}
    {requests.error && <ErrorNotice message="LGU subscription requests could not be loaded." onRetry={() => void requests.refetch()} retrying={requests.isFetching} />}
    {requests.data?.total === 0 && !requests.isPending && <p className="field-hint">No {status === 'pending' ? 'LGU subscription requests are awaiting review' : 'matching LGU subscription requests'}.</p>}
    <div className="platform-plan-request-list">{requests.data?.rows.map((request) => <article className="ops-panel platform-plan-request-card" key={request.request_id}>
      <header><div><strong>{request.municipality}, {request.province}</strong><small>Requested by {request.requester_name}</small></div><StatusPill status={request.status} /></header>
      <dl><div><dt>Requested plan</dt><dd>{request.plan_name} · ₱2,500/month</dd></div><div><dt>Submitted</dt><dd>{formatDateTime(request.created_at)}</dd></div>{request.reviewed_at && <div><dt>Reviewed</dt><dd>{formatDateTime(request.reviewed_at)}</dd></div>}</dl>
      {request.request_note && <p className="platform-plan-request-note"><strong>LGU note:</strong> {request.request_note}</p>}
      {request.admin_note && <p className="platform-plan-request-note"><strong>Admin record:</strong> {request.admin_note}</p>}
      {request.status === 'pending' && <div className="platform-plan-request-review"><label>{status === 'pending' ? 'Payment confirmation record or decline reason' : 'Review note'}<span className="field-hint">Required for both activation and decline.</span><textarea maxLength={950} value={notes[request.request_id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [request.request_id]: event.target.value }))} placeholder="Record the payment confirmation or reason for declining" /></label><div className="finance-review-actions"><button type="button" className="button outline danger-action" disabled={Boolean(busyId)} onClick={() => { if ((notes[request.request_id]?.trim().length ?? 0) < 3) { setError('Add a decline reason before declining this request.'); return } setError(''); setDeclineTarget(request) }}><XCircle size={15} />Decline request</button><button type="button" className="button primary" disabled={Boolean(busyId)} onClick={() => { if ((notes[request.request_id]?.trim().length ?? 0) < 3) { setError('Record how payment was confirmed before activating this request.'); return } setError(''); setActivationTarget(request) }}><BadgeCheck size={15} />Activate one month</button></div></div>}
    </article>)}</div>
    {requests.data && totalPages > 1 && <nav className="directory-pagination" aria-label="LGU subscription request pages"><button type="button" className="button outline" disabled={page === 0 || requests.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={15} />Previous</button><span>Page {page + 1} of {totalPages}</span><button type="button" className="button outline" disabled={page + 1 >= totalPages || requests.isFetching} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={15} /></button></nav>}
    {activationTarget && <ActionConfirmationDialog title={`Activate a monthly plan for ${activationTarget.municipality}?`} description="This records the payment confirmation note and starts one monthly LGU subscription period. KABALIKAT will not collect a payment automatically." confirmLabel={busyId === activationTarget.request_id ? 'Activating…' : 'Activate one month'} busy={busyId === activationTarget.request_id} onCancel={() => setActivationTarget(null)} onConfirm={() => void review(activationTarget.request_id, 'activate')} />}
    {declineTarget && <ActionConfirmationDialog title={`Decline the monthly plan request for ${declineTarget.municipality}?`} description="This records the reason you entered and keeps the current LGU subscription period unchanged." confirmLabel="Decline request" busy={busyId === declineTarget.request_id} onCancel={() => setDeclineTarget(null)} onConfirm={() => void review(declineTarget.request_id, 'decline')} />}
  </section>
}
