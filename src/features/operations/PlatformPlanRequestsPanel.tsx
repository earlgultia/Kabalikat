import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, XCircle } from 'lucide-react'
import { formatDateTime } from './format'
import { ErrorNotice, LoadingNotice, StatusPill } from './shared'
import { activatePlanRequest, declinePlanRequest, listPlatformPlanRequests, PLATFORM_PLAN_REQUEST_PAGE_SIZE } from './subscription-requests-data'

export function PlatformPlanRequestsPanel() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('pending')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requests = useQuery({ queryKey: ['platform-plan-requests', page, status], queryFn: () => listPlatformPlanRequests(page, status) })
  const totalPages = Math.max(1, Math.ceil((requests.data?.total ?? 0) / PLATFORM_PLAN_REQUEST_PAGE_SIZE))

  async function review(requestId: string, decision: 'activate' | 'decline') {
    const note = notes[requestId]?.trim() ?? ''
    if (note.length < 3 || note.length > 950) { setError('Add a note of 3 to 950 characters before recording this decision.'); return }
    if (decision === 'activate' && !window.confirm('Have you confirmed the GCash payment with the barangay? This will activate the requested plan immediately.')) return
    setBusyId(requestId); setError(''); setMessage('')
    try {
      if (decision === 'activate') await activatePlanRequest(requestId, note)
      else await declinePlanRequest(requestId, note)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-plan-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-subscriptions'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-subscription-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-activity'] }),
      ])
      setNotes((existing) => ({ ...existing, [requestId]: '' }))
      // Show the recorded decision immediately and keep the request out of
      // the pending queue after the server refreshes it.
      setStatus(decision === 'activate' ? 'activated' : 'declined')
      setPage(0)
      setMessage(decision === 'activate' ? 'Payment confirmation recorded and requested plan activated.' : 'Plan request declined with your note.')
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Unable to process this plan request.')
    } finally { setBusyId('') }
  }

  return <section className="platform-plan-requests" aria-labelledby="platform-plan-requests-title">
    <div className="ops-panel-heading"><div><h2 id="platform-plan-requests-title">Manual plan requests</h2><p>Confirm GCash payment with the barangay before activating a request. No payment is collected in KABALIKAT.</p></div><CircleDollarSign size={19} /></div>
    {message && <div className="ops-success" role="status"><CheckCircle2 size={16} />{message}</div>}
    {error && <div className="platform-plan-request-error"><ErrorNotice message={error} /><details><summary>Action details</summary><p>{error}</p></details></div>}
    <div className="platform-plan-request-filters"><label>Request status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}><option value="pending">Awaiting review</option><option value="activated">Activated</option><option value="declined">Declined</option><option value="all">All requests</option></select></label><span className="field-hint">{requests.data?.total ?? 0} requests</span></div>
    {requests.isPending && <LoadingNotice compact />}{requests.error && <ErrorNotice message="Plan requests could not be loaded." onRetry={() => void requests.refetch()} retrying={requests.isFetching} />}
    {requests.data?.total === 0 && !requests.isPending && <p className="field-hint">No {status === 'pending' ? 'plan requests are awaiting review' : 'matching plan requests'}.</p>}
    <div className="platform-plan-request-list">{requests.data?.rows.map((request) => <article className="ops-panel platform-plan-request-card" key={request.request_id}>
      <header><div><strong>{request.barangay_name}</strong><small>{request.barangay_code} · Requested by {request.requester_name}</small></div><StatusPill status={request.status} /></header>
      <dl><div><dt>Requested plan</dt><dd>{request.plan_name}</dd></div><div><dt>Submitted</dt><dd>{formatDateTime(request.created_at)}</dd></div>{request.reviewed_at && <div><dt>Reviewed</dt><dd>{formatDateTime(request.reviewed_at)}</dd></div>}</dl>
      {request.request_note && <p className="platform-plan-request-note"><strong>Captain’s note:</strong> {request.request_note}</p>}
      {request.admin_note && <p className="platform-plan-request-note"><strong>Admin note:</strong> {request.admin_note}</p>}
      {request.status === 'pending' && <div className="platform-plan-request-review"><label>Admin note<span className="field-hint">For activation, record how and when you verified payment. For decline, explain the reason.</span><textarea maxLength={950} value={notes[request.request_id] ?? ''} onChange={(event) => setNotes((existing) => ({ ...existing, [request.request_id]: event.target.value }))} placeholder="Payment verified with the barangay via GCash…" /></label><div className="finance-review-actions"><button type="button" className="button outline danger-action" disabled={Boolean(busyId)} onClick={() => void review(request.request_id, 'decline')}><XCircle size={15} />Decline request</button><button type="button" className="button primary" disabled={Boolean(busyId)} onClick={() => void review(request.request_id, 'activate')}><CheckCircle2 size={15} />{busyId === request.request_id ? 'Saving…' : 'Confirm payment & activate'}</button></div></div>}
    </article>)}</div>
    {requests.data && totalPages > 1 && <nav className="directory-pagination" aria-label="Plan request pages"><button type="button" className="button outline" disabled={page === 0 || requests.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={15} />Previous</button><span>Page {page + 1} of {totalPages}</span><button type="button" className="button outline" disabled={page + 1 >= totalPages || requests.isFetching} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={15} /></button></nav>}
  </section>
}
