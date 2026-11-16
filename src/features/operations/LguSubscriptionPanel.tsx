import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CircleDollarSign, Clock3 } from 'lucide-react'
import { ErrorNotice, LoadingNotice, StatusPill } from './shared'
import { formatDateTime } from './format'
import { getLguMonthlySubscription, listLguMonthlySubscriptionRequests, requestLguMonthlySubscription } from './lgu-subscription-data'

export function LguSubscriptionPanel() {
  const queryClient = useQueryClient()
  const current = useQuery({ queryKey: ['lgu-monthly-subscription'], queryFn: getLguMonthlySubscription, refetchInterval: 60_000, refetchOnWindowFocus: true })
  const requests = useQuery({ queryKey: ['lgu-monthly-subscription-requests'], queryFn: listLguMonthlySubscriptionRequests })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const pending = requests.data?.find((request) => request.status === 'pending')
  const periodEnd = current.data ? new Date(current.data.period_ends_at).getTime() : null
  const periodExpired = periodEnd !== null && periodEnd <= Date.now()
  const daysRemaining = periodEnd === null ? null : Math.ceil((periodEnd - Date.now()) / (24 * 60 * 60 * 1000))
  const subscriptionNotice = current.data?.status === 'suspended'
    ? pending ? 'This LGU subscription is suspended and your renewal request is awaiting ArkByte review.' : 'This LGU subscription is suspended. Request a renewal below and contact ArkByte if you need help restoring municipal access.'
    : current.data?.status === 'cancelled'
      ? pending ? 'This LGU subscription was cancelled and your new monthly subscription request is awaiting ArkByte review.' : 'This LGU subscription was cancelled. Submit a new monthly subscription request to restore municipal access.'
      : current.data?.status === 'past_due' || periodExpired
        ? pending ? 'The LGU paid period has ended or is past due. Your renewal request is awaiting ArkByte review.' : 'The LGU paid period has ended or is past due. Municipal operations are paused until a renewal is reviewed and activated.'
        : daysRemaining !== null && daysRemaining <= 7
          ? `The LGU paid period ends in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}. ${pending ? 'Your renewal request is awaiting ArkByte review; access stays active through' : 'You can request renewal below; access stays active through'} ${formatDateTime(current.data!.period_ends_at)}.`
          : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      await requestLguMonthlySubscription(note)
      setNote('')
      await queryClient.invalidateQueries({ queryKey: ['lgu-monthly-subscription-requests'] })
      setMessage('Monthly LGU subscription request sent to ArkByte for review. No payment was collected.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit the LGU subscription request.')
    } finally { setBusy(false) }
  }

  return <section className="ops-panel" aria-labelledby="lgu-subscription-title">
    <div className="ops-panel-heading"><div><h2 id="lgu-subscription-title">LGU monthly subscription</h2><p>Request or renew the municipality plan. Payment is arranged directly with ArkByte; KABALIKAT does not charge an account.</p></div><CircleDollarSign size={19} /></div>
    {message && <div className="ops-success" role="status"><BadgeCheck size={16} />{message}</div>}
    {error && <ErrorNotice message={error} />}
    {current.isPending && <LoadingNotice compact />}
    {current.error && <ErrorNotice message="The LGU subscription status could not be loaded." onRetry={() => void current.refetch()} retrying={current.isFetching} />}
    {current.data && <div className="tenant-subscription-current"><span className="tenant-subscription-icon"><CircleDollarSign size={19} /></span><div><span className="field-hint">MONTHLY MUNICIPALITY PLAN</span><h3>{current.data.plan_name}</h3><p><StatusPill status={periodExpired ? 'past_due' : current.data.status} /> <span>{periodExpired ? 'Monthly period ended' : 'Period ends'} {formatDateTime(current.data.period_ends_at)}</span></p></div></div>}
    {subscriptionNotice && <div className={periodExpired || current.data?.status === 'past_due' || current.data?.status === 'suspended' || current.data?.status === 'cancelled' ? 'error-banner' : 'resident-request-guidance'} role="status">{subscriptionNotice}</div>}
    {requests.isPending && <LoadingNotice compact />}
    {requests.error && <ErrorNotice message="LGU subscription requests could not be loaded." onRetry={() => void requests.refetch()} retrying={requests.isFetching} />}
    {pending && <div className="tenant-subscription-pending" role="status"><Clock3 size={18} /><div><strong>Monthly subscription request awaiting review</strong><p>{pending.plan_name} requested {formatDateTime(pending.created_at)}. The current subscription period remains recorded until ArkByte reviews the request.</p></div><StatusPill status="pending" /></div>}
    {requests.data && !pending && <form className="tenant-plan-request" onSubmit={(event) => void submit(event)}>
      <p><strong>LGU plan: ₱2,500 per month.</strong> An administrator will confirm the payment arrangement and activate one monthly period. This form does not collect payment details.</p>
      <label className="tenant-plan-note">Note for ArkByte (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Share a question or payment arrangement reference." /></label>
      <div className="ops-form-actions"><span className="field-hint">One request can be under review at a time.</span><button className="button primary" disabled={busy}>{busy ? 'Submitting request…' : current.data ? 'Request monthly renewal' : 'Request monthly subscription'}</button></div>
    </form>}
    {requests.data && requests.data.filter((request) => request.status !== 'pending').length > 0 && <ul className="tenant-plan-history">{requests.data.filter((request) => request.status !== 'pending').slice(0, 5).map((request) => <li key={request.request_id}><div><strong>{request.plan_name}</strong><small>{request.status === 'activated' ? 'Activated' : 'Declined'} · {formatDateTime(request.reviewed_at ?? request.created_at)}</small>{request.admin_note && <p>{request.admin_note}</p>}</div><StatusPill status={request.status} /></li>)}</ul>}
  </section>
}
