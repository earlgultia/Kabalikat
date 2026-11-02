import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CircleDollarSign, Clock3, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'
import { getTenantSubscriptionStatus, listAvailableSubscriptionPlans, listTenantPlanRequests, requestTenantSubscriptionPlan } from './subscription-requests-data'

export function TenantSubscriptionPage() {
  const { membership } = useAuth()
  const barangayId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const plans = useQuery({ queryKey: ['available-subscription-plans'], queryFn: listAvailableSubscriptionPlans })
  const current = useQuery({ queryKey: ['tenant-subscription-status', barangayId], queryFn: () => getTenantSubscriptionStatus(barangayId), enabled: Boolean(barangayId) })
  const requests = useQuery({ queryKey: ['tenant-subscription-plan-requests', barangayId], queryFn: () => listTenantPlanRequests(barangayId), enabled: Boolean(barangayId) })
  const pendingRequest = requests.data?.find((request) => request.status === 'pending')
  const [selectedPlan, setSelectedPlan] = useState('')
  const [requestNote, setRequestNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPlan) { setError('Choose a plan before submitting your request.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await requestTenantSubscriptionPlan(barangayId, selectedPlan, requestNote.trim())
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant-subscription-plan-requests', barangayId] }),
        queryClient.invalidateQueries({ queryKey: ['platform-plan-requests'] }),
      ])
      setSelectedPlan(''); setRequestNote('')
      setMessage('Your plan request was sent to ArkByte for review. The subscription will change only after an administrator confirms payment and activates it.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit your plan request.')
    } finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Plans & subscription" description="Choose a plan for your barangay. Payment is handled directly with ArkByte; there is no online checkout." />
    {message && <div className="ops-success" role="status"><BadgeCheck size={17} />{message}</div>}
    {error && <ErrorNotice message={error} />}
    {current.isPending && <LoadingNotice compact />}
    {current.error && <ErrorNotice message="Unable to load your current subscription." onRetry={() => void current.refetch()} retrying={current.isFetching} />}
    {current.data && <section className="ops-panel tenant-subscription-current" aria-label="Current subscription">
      <span className="tenant-subscription-icon"><ShieldCheck size={19} /></span>
      <div><span className="field-hint">CURRENT BARANGAY PLAN</span><h2>{current.data.plan_name}</h2><p><StatusPill status={current.data.subscription_status} /> <span>Updated {formatDateTime(current.data.updated_at)}</span></p></div>
    </section>}
    <section className="ops-panel manual-payment-notice"><CircleDollarSign size={20} /><div><h2>Manual payment by arrangement</h2><p>Submit your chosen plan here, then contact ArkByte directly to arrange the plan. A Super Admin will activate it when the arrangement is complete.</p><p className="field-hint">This request does not collect payment information or change your current access.</p></div></section>
    {requests.isPending && <LoadingNotice compact />}
    {requests.error && <ErrorNotice message="Your plan request history could not be loaded." onRetry={() => void requests.refetch()} retrying={requests.isFetching} />}
    {pendingRequest && <section className="ops-panel tenant-subscription-pending" aria-live="polite"><Clock3 size={19} /><div><strong>Plan request awaiting review</strong><p>{pendingRequest.plan_name} requested {formatDateTime(pendingRequest.created_at)}. Your current subscription stays in place until an administrator confirms the payment and activates the plan.</p></div><StatusPill status="pending" /></section>}
    {!pendingRequest && <form className="tenant-plan-request" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>Choose a plan</h2><p>Only one request can be under review at a time.</p></div><CircleDollarSign size={19} /></div>
      {plans.isPending && <LoadingNotice compact />}{plans.error && <ErrorNotice message="Available plans could not be loaded." onRetry={() => void plans.refetch()} retrying={plans.isFetching} />}
      {plans.data?.length === 0 && !plans.isPending && <p className="field-hint">There are no paid plans currently open for requests. Contact ArkByte for assistance.</p>}
      {plans.data && plans.data.length > 0 && <div className="tenant-plan-options">{plans.data.map((plan) => <label className={`tenant-plan-option ${selectedPlan === plan.plan_key ? 'selected' : ''}`} key={plan.plan_key}>
        <input type="radio" name="plan" value={plan.plan_key} checked={selectedPlan === plan.plan_key} onChange={() => setSelectedPlan(plan.plan_key)} />
        <span><strong>{plan.plan_name}</strong><small>{plan.plan_description || 'Plan details and pricing are provided by ArkByte.'}</small><small>Price and payment instructions are confirmed directly with ArkByte.</small></span>
      </label>)}</div>}
      <label className="tenant-plan-note">Note for ArkByte (optional)<textarea value={requestNote} onChange={(event) => setRequestNote(event.target.value)} maxLength={500} placeholder="Share a question or a good time to contact you." /></label>
      <div className="ops-form-actions"><button className="button primary" disabled={busy || plans.isPending || !plans.data?.length || !selectedPlan}>{busy ? 'Submitting request…' : 'Request this plan'}</button></div>
    </form>}
    {requests.data && requests.data.filter((request) => request.status !== 'pending').length > 0 && <section className="ops-panel tenant-plan-history"><h2>Previous requests</h2><ul>{requests.data.filter((request) => request.status !== 'pending').map((request) => <li key={request.request_id}><div><strong>{request.plan_name}</strong><small>{request.status === 'activated' ? 'Activated' : 'Declined'} · {formatDateTime(request.reviewed_at ?? request.created_at)}</small>{request.admin_note && <p>{request.admin_note}</p>}</div><StatusPill status={request.status} /></li>)}</ul></section>}
  </section>
}
