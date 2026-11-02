import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { BadgeCheck, ChevronLeft, ChevronRight, CreditCard, Download, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'
import { getSubscriptionSummary, listSubscriptionEvents, listSubscriptionPage, listSubscriptionPlans, setSubscription, updateSubscriptionPlan, SUBSCRIPTION_EVENT_PAGE_SIZE, SUBSCRIPTION_PAGE_SIZE, type SubscriptionEvent, type SubscriptionOverviewRow, type SubscriptionPlan } from './subscriptions-data'
import { encodeCsv } from './csv'
import { ActionConfirmationDialog } from '../../components/ActionConfirmationDialog'
import { PlatformPlanRequestsPanel } from './PlatformPlanRequestsPanel'

const updateSchema = z.object({ planKey: z.string().min(1), status: z.enum(['free','trial','active','past_due','suspended','cancelled']), trialDays: z.coerce.number().int().min(1).max(90), graceDays: z.coerce.number().int().min(0).max(30), note: z.string().trim().min(3).max(1000), resetDates: z.boolean() })
const statusLabels: Record<string,string> = { free: 'Free', trial: 'Trial', active: 'Active (manual)', past_due: 'Past due (manual)', suspended: 'Suspended (manual)', cancelled: 'Ended / cancelled' }

export function SubscriptionsPage() {
  const queryClient = useQueryClient()
  const plans = useQuery({ queryKey: ['subscription-plans'], queryFn: listSubscriptionPlans })
  const [page, setPage] = useState(0)
  const [subscriptionSearch, setSubscriptionSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const subscriptions = useQuery({ queryKey: ['platform-subscriptions', page, subscriptionSearch, statusFilter], queryFn: () => listSubscriptionPage({ page, search: subscriptionSearch, status: statusFilter }) })
  const summary = useQuery({ queryKey: ['platform-subscription-summary'], queryFn: getSubscriptionSummary, staleTime: 60_000 })
  const [selectedId, setSelectedId] = useState('')
  const [selectedSnapshot, setSelectedSnapshot] = useState<SubscriptionOverviewRow | null>(null)
  const [historyPage, setHistoryPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pendingUpdate, setPendingUpdate] = useState<z.infer<typeof updateSchema> | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportingHistory, setExportingHistory] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingPlanId, setEditingPlanId] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const selected = subscriptions.data?.rows.find((row) => row.barangay_id === selectedId) ?? selectedSnapshot ?? undefined
  const selectedTrialEnd = selected?.trial_ends_at ? new Date(selected.trial_ends_at).getTime() : null
  const selectedGraceEnd = selected?.grace_ends_at ? new Date(selected.grace_ends_at).getTime() : null
  const selectedReviewReason = selected?.status === 'suspended'
    ? 'This subscription is manually suspended and needs an administrative review.'
    : selected?.status === 'trial' && selectedTrialEnd !== null && selectedTrialEnd <= Date.now()
      ? `The trial ended ${formatDateTime(selected.trial_ends_at!)}. Review the status and record your decision below.`
      : selected?.status === 'past_due' && selectedGraceEnd !== null && selectedGraceEnd <= Date.now()
        ? `The grace period ended ${formatDateTime(selected.grace_ends_at!)}. Review the status and record your decision below.`
        : selected?.status === 'past_due' && selectedGraceEnd !== null && selectedGraceEnd <= Date.now() + 7 * 24 * 60 * 60 * 1000
          ? `The grace period ends ${formatDateTime(selected.grace_ends_at!)}. Review the account before then.`
        : selected?.status === 'trial' && selectedTrialEnd !== null && selectedTrialEnd <= Date.now() + 7 * 24 * 60 * 60 * 1000
          ? `The trial is scheduled to end ${formatDateTime(selected.trial_ends_at!)}. Review the account before then.`
          : null
  const history = useQuery({ queryKey: ['subscription-events', selectedId, historyPage], queryFn: () => listSubscriptionEvents(selectedId, historyPage), enabled: Boolean(selectedId), staleTime: 30_000 })
  const rows = subscriptions.data?.rows ?? []
  const total = subscriptions.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / SUBSCRIPTION_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['platform-subscriptions'] }), queryClient.invalidateQueries({ queryKey: ['platform-subscription-summary'] }), queryClient.invalidateQueries({ queryKey: ['platform-barangays'] }), queryClient.invalidateQueries({ queryKey: ['platform-barangay-summary'] }), queryClient.invalidateQueries({ queryKey: ['subscription-plans'] })])
  }

  async function submitPlan(event: FormEvent<HTMLFormElement>, plan: SubscriptionPlan) {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    let entitlements: Record<string, boolean>
    try {
      const parsed: unknown = JSON.parse(String(values.entitlements ?? '{}'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      const entries = Object.entries(parsed)
      if (entries.length > 30 || entries.some(([key, value]) => !/^[a-z][a-z0-9_]{1,59}$/.test(key) || typeof value !== 'boolean')) throw new Error()
      entitlements = Object.fromEntries(entries) as Record<string, boolean>
    } catch {
      setError('Enter entitlements as a JSON object with valid feature keys and true/false values (up to 30).')
      return
    }
    setError(''); setMessage(''); setPlanBusy(true)
    try {
      await updateSubscriptionPlan({ id: plan.id, name: String(values.name ?? ''), description: String(values.description ?? ''), entitlements, active: plan.key === 'free' || values.active === 'on' })
      await refresh()
      setEditingPlanId('')
      setMessage(`${plan.name} plan metadata saved. Any changed fields are recorded in platform activity.`)
    } catch {
      setError('Unable to update this plan. Check the values and try again.')
    } finally { setPlanBusy(false) }
  }

  async function exportSubscriptions() {
    setExporting(true); setError('')
    try {
    const allRows: SubscriptionOverviewRow[] = []
    for (let exportPage = 0; ; exportPage += 1) {
      const result = await listSubscriptionPage({ page: exportPage, search: subscriptionSearch, status: statusFilter })
      allRows.push(...result.rows)
      if (allRows.length >= result.total || result.rows.length === 0) break
    }
    const csvRows = [
      ['Barangay', 'Barangay code', 'Plan', 'Admin-managed status', 'Trial end', 'Grace end', 'Last updated'],
      ...allRows.map((row) => [row.barangay_name, row.barangay_code, row.plan_name, statusLabels[row.status] ?? row.status, row.trial_ends_at, row.grace_ends_at, row.updated_at]),
    ]
    const csv = encodeCsv(csvRows)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'kabalikat-subscription-review.csv'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('Unable to export all matching subscriptions. Please try again.') }
    finally { setExporting(false) }
  }

  async function exportSubscriptionHistory() {
    if (!selected) return
    setExportingHistory(true); setError('')
    try {
      const allEvents: SubscriptionEvent[] = []
      for (let exportPage = 0; ; exportPage += 1) {
        const result = await listSubscriptionEvents(selected.barangay_id, exportPage)
        allEvents.push(...result.events)
        if (allEvents.length >= result.total || result.events.length === 0) break
      }
      const csvRows = [
        ['Recorded at', 'Action', 'Previous plan', 'New plan', 'Previous status', 'New status', 'Previous start', 'New start', 'Previous trial end', 'New trial end', 'Previous grace end', 'New grace end', 'Administrative note'],
        ...allEvents.map((event) => [event.created_at, event.action, event.from_plan, event.to_plan, event.from_status, event.to_status, event.from_started_at, event.to_started_at, event.from_trial_ends_at, event.to_trial_ends_at, event.from_grace_ends_at, event.to_grace_ends_at, event.note]),
      ]
      const csv = encodeCsv(csvRows)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `kabalikat-subscription-history-${selected.barangay_code.replace(/[^a-z0-9_-]/gi, '-')}.csv`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('Unable to export this subscription history. Refresh and try again.') }
    finally { setExportingHistory(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const parsed = updateSchema.safeParse({ ...Object.fromEntries(formData.entries()), resetDates: formData.has('resetDates') })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the subscription update.'); return }
    if (parsed.data.status === 'free' && parsed.data.planKey !== 'free') { setError('Choose the Free plan when selecting Free status.'); return }
    if (parsed.data.status === 'trial' && parsed.data.planKey === 'free') { setError('A trial must use a paid plan entry.'); return }
    setError(''); setPendingUpdate(parsed.data)
  }

  async function confirmSubscriptionUpdate() {
    if (!selected || !pendingUpdate) return
    setBusy(true); setError(''); setMessage('')
    try { await setSubscription({ barangayId: selected.barangay_id, planKey: pendingUpdate.planKey, status: pendingUpdate.status, trialDays: pendingUpdate.trialDays, graceDays: pendingUpdate.graceDays, note: pendingUpdate.note, resetDates: pendingUpdate.resetDates }); await refresh(); await queryClient.invalidateQueries({ queryKey: ['subscription-events', selected.barangay_id] }); setSelectedId(''); setSelectedSnapshot(null); setMessage('Subscription record updated and audit history recorded.'); setPendingUpdate(null) }
    catch { setError('Unable to update this subscription. Refresh and try again.'); setPendingUpdate(null) }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Subscriptions & plans" description="Review plan requests, confirm offline payments, activate plans, or end a subscription manually.">
      <button className="button outline" disabled={subscriptions.isFetching || plans.isFetching || summary.isFetching} onClick={() => { void subscriptions.refetch(); void plans.refetch(); void summary.refetch() }}><RefreshCw size={15} />Refresh</button>
    </PageHeading>
    <PlatformPlanRequestsPanel />
    <div className="ops-panel subscription-notice"><ShieldAlert size={19} /><p><strong>Billing is not connected.</strong> Status changes here are manual administrative records; they do not process payments or restrict workspace access. Plan entitlements are catalog metadata and are not enforced.</p></div>
    {message && <div className="ops-success"><BadgeCheck size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    <div className="subscription-summary"><div><strong>{summary.data?.barangay_count ?? 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</strong><span>Barangays</span></div><div><strong>{summary.data?.active_trial_count ?? 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</strong><span>Trials in period</span></div><button type="button" className={`subscription-review-shortcut upcoming${statusFilter === 'trials_ending_soon' ? ' is-selected' : ''}`} aria-label={`Show ${summary.data?.trial_ending_soon_count ?? 0} trials ending in the next seven days`} onClick={() => { setStatusFilter((current) => current === 'trials_ending_soon' ? 'all' : 'trials_ending_soon'); setPage(0); document.getElementById('subscription-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><strong>{summary.data?.trial_ending_soon_count ?? 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</strong><span>Trials end within 7 days Ãƒâ€šÃ‚Â· review</span></button><button type="button" className={`subscription-review-shortcut${statusFilter === 'grace_ending_soon' ? ' is-selected' : ''}`} aria-label={`Show ${summary.data?.grace_ending_soon_count ?? 0} grace periods ending in the next seven days`} onClick={() => { setStatusFilter((current) => current === 'grace_ending_soon' ? 'all' : 'grace_ending_soon'); setPage(0); document.getElementById('subscription-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><strong>{summary.data?.grace_ending_soon_count ?? 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</strong><span>Grace periods end within 7 days Ãƒâ€šÃ‚Â· review</span></button><div><strong>{summary.data?.elapsed_trial_count ?? 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</strong><span>Trial elapsed Ãƒâ€šÃ‚Â· review</span></div><div><strong>{summary.data?.past_due_count ?? 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</strong><span>Past due Ãƒâ€šÃ‚Â· manual</span></div><div><strong>{summary.data?.suspended_count ?? 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</strong><span>Manually suspended</span></div><button type="button" className={`subscription-review-shortcut${statusFilter === 'needs_review' ? ' is-selected' : ''}`} aria-label={`Show ${summary.data?.needs_review_count ?? 0} subscriptions needing review`} onClick={() => { setStatusFilter((current) => current === 'needs_review' ? 'all' : 'needs_review'); setPage(0); document.getElementById('subscription-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><strong>{summary.data?.needs_review_count ?? 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</strong><span>Needs review Ãƒâ€šÃ‚Â· open queue</span></button></div>
    {plans.isPending && <LoadingNotice />}{plans.error && <ErrorNotice message="Unable to load subscription plans." onRetry={() => void plans.refetch()} retrying={plans.isFetching} />}
    {plans.data && <section className="subscription-plan-section">
      <div className="ops-panel-heading"><div><h2>Plan catalog</h2><p>Configure plan descriptions and entitlement metadata. Entitlements do not gate access.</p></div><CreditCard size={18} /></div>
      <div className="subscription-plan-list">{plans.data.map((plan) => {
        const entitlementKeys = Object.entries(plan.entitlements ?? {}).filter(([, value]) => Boolean(value)).map(([key]) => key)
        return <article className="ops-panel subscription-plan" key={plan.id}>
          <header><h3>{plan.name}</h3><span className={`status-pill ${plan.active ? 'status-active' : 'status-archived'}`}>{plan.active ? 'Available' : 'Inactive'}</span></header>
          <p>{plan.description}</p>
          <div className="subscription-plan-meta"><small>Plan key: {plan.key}</small><small>Assigned to {plan.assigned_barangay_count.toLocaleString()} {plan.assigned_barangay_count === 1 ? 'barangay' : 'barangays'}</small></div>
          <div className="subscription-entitlements"><strong>Configured entitlements</strong>{entitlementKeys.length ? <ul>{entitlementKeys.map((key) => <li key={key}>{key.replaceAll('_', ' ')}</li>)}</ul> : <span>Not configured</span>}</div>
          {editingPlanId === plan.id ? <form className="subscription-plan-form" onSubmit={(event) => void submitPlan(event, plan)}>
            <label>Plan name<input name="name" minLength={2} maxLength={100} required defaultValue={plan.name} /></label>
            <label>Description<textarea name="description" maxLength={1000} defaultValue={plan.description} /></label>
            <label>Entitlements (JSON)<textarea className="subscription-entitlements-input" name="entitlements" spellCheck={false} defaultValue={JSON.stringify(plan.entitlements ?? {}, null, 2)} aria-describedby={`entitlements-help-${plan.id}`} /><span className="field-hint" id={`entitlements-help-${plan.id}`}>Use feature keys with true or false values. Example: {'{"resident_directory": true}'}. Catalog metadata only.</span></label>
            <label className="subscription-plan-active"><input name="active" type="checkbox" defaultChecked={plan.active} disabled={plan.key === 'free'} /><span>Available for new subscription changes</span></label>
            <div className="ops-form-actions"><button type="button" className="button outline" disabled={planBusy} onClick={() => setEditingPlanId('')}>Cancel</button><button type="submit" className="button primary" disabled={planBusy}>{planBusy ? 'Saving…' : 'Save plan'}</button></div>
          </form> : <button type="button" className="button outline subscription-plan-edit" onClick={() => { setError(''); setEditingPlanId(plan.id) }}>Edit plan</button>}
        </article>
      })}</div>
    </section>}
    {subscriptions.isPending && <LoadingNotice />}{subscriptions.error && <ErrorNotice message="Unable to load subscription records." onRetry={() => void subscriptions.refetch()} retrying={subscriptions.isFetching} />}
    {subscriptions.data && <div className="subscription-table-section" id="subscription-queue">
      <div className="platform-directory-controls subscription-table-controls">
        <label className="archive-search"><Search size={17} /><input aria-label="Search subscriptions" placeholder="Search barangay, code, or plan" value={subscriptionSearch} onChange={(event) => { setSubscriptionSearch(event.target.value); setPage(0) }} /></label>
        <label className="archive-folder-select">Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0) }}><option value="all">All statuses</option><option value="needs_review">Needs review</option><option value="trials_ending_soon">Trials ending in 7 days</option><option value="grace_ending_soon">Grace periods ending in 7 days</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <span className="field-hint" aria-live="polite">Showing {total ? currentPage * SUBSCRIPTION_PAGE_SIZE + 1 : 0}â€“{Math.min((currentPage + 1) * SUBSCRIPTION_PAGE_SIZE, total)} of {total} barangays</span>
        <button type="button" className="button outline" disabled={!total || exporting || subscriptions.isFetching} onClick={() => void exportSubscriptions()}><Download size={15} />{exporting ? 'Exportingâ€¦' : 'Export matching rows'}</button>
      </div>
      {total ? <><div className="ops-table-wrap subscription-table-wrap"><table className="ops-table subscription-table"><thead><tr><th>Barangay</th><th>Plan</th><th>Admin-managed status</th><th>Trial end</th><th>Grace end</th><th>Latest admin note</th><th>Updated</th><th /></tr></thead><tbody>{rows.map((row) => {
      const trialElapsed = row.status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at).getTime() <= Date.now()
      const trialEndingSoon = row.status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at).getTime() > Date.now() && new Date(row.trial_ends_at).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000
      const graceElapsed = row.status === 'past_due' && row.grace_ends_at && new Date(row.grace_ends_at).getTime() <= Date.now()
      const graceEndingSoon = row.status === 'past_due' && row.grace_ends_at && new Date(row.grace_ends_at).getTime() > Date.now() && new Date(row.grace_ends_at).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000
      return <tr key={row.barangay_id}><td><strong>{row.barangay_name}</strong><small>{row.barangay_code}</small></td><td>{row.plan_name}</td><td><StatusPill status={row.status} /><small>{trialElapsed ? 'Trial elapsed Ãƒâ€šÃ‚Â· manual review required' : graceElapsed ? 'Grace elapsed Ãƒâ€šÃ‚Â· manual review required' : trialEndingSoon ? 'Trial ends within 7 days Ãƒâ€šÃ‚Â· review' : graceEndingSoon ? 'Grace ends within 7 days Ãƒâ€šÃ‚Â· review' : statusLabels[row.status]}</small></td><td>{row.trial_ends_at ? formatDateTime(row.trial_ends_at) : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</td><td>{row.grace_ends_at ? formatDateTime(row.grace_ends_at) : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</td><td><details className="subscription-admin-note"><summary>{row.admin_note ? 'View note' : 'No note'}</summary><p>{row.admin_note || 'No administrative note recorded.'}</p></details></td><td>{formatDateTime(row.updated_at)}</td><td><button className="button outline" onClick={() => { setSelectedId(row.barangay_id); setSelectedSnapshot(row); setHistoryPage(0); setError(''); setMessage('') }}>Manage</button></td></tr>
    })}</tbody></table></div><div className="subscription-cards">{rows.map((row) => {
      const trialElapsed = row.status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at).getTime() <= Date.now()
      const trialEndingSoon = row.status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at).getTime() > Date.now() && new Date(row.trial_ends_at).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000
      const graceElapsed = row.status === 'past_due' && row.grace_ends_at && new Date(row.grace_ends_at).getTime() <= Date.now()
      const graceEndingSoon = row.status === 'past_due' && row.grace_ends_at && new Date(row.grace_ends_at).getTime() > Date.now() && new Date(row.grace_ends_at).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000
      return <article className="subscription-card" key={row.barangay_id}><header><div><strong>{row.barangay_name}</strong><small>{row.barangay_code}</small></div><StatusPill status={row.status} /></header><dl><div><dt>Plan</dt><dd>{row.plan_name}</dd></div><div><dt>Trial ends</dt><dd>{row.trial_ends_at ? formatDateTime(row.trial_ends_at) : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</dd></div><div><dt>Grace period ends</dt><dd>{row.grace_ends_at ? formatDateTime(row.grace_ends_at) : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</dd></div><div><dt>Last updated</dt><dd>{formatDateTime(row.updated_at)}</dd></div></dl><details className="subscription-card-note"><summary>Latest administrative note</summary><p>{row.admin_note || 'No administrative note recorded.'}</p></details><p>{trialElapsed ? 'Trial elapsed Ãƒâ€šÃ‚Â· manual review required' : graceElapsed ? 'Grace period elapsed Ãƒâ€šÃ‚Â· manual review required' : trialEndingSoon ? 'Trial ends within 7 days Ãƒâ€šÃ‚Â· review' : graceEndingSoon ? 'Grace ends within 7 days Ãƒâ€šÃ‚Â· review' : statusLabels[row.status]}</p><button type="button" className="button outline" onClick={() => { setSelectedId(row.barangay_id); setSelectedSnapshot(row); setHistoryPage(0); setError(''); setMessage('') }}>Manage subscription</button></article>
    })}</div>{pageCount > 1 && <nav className="directory-pagination" aria-label="Subscription pages"><button type="button" className="button outline" disabled={currentPage === 0 || subscriptions.isFetching} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} />Previous</button><span aria-live="polite">Page {currentPage + 1} of {pageCount}</span><button type="button" className="button outline" disabled={currentPage + 1 === pageCount || subscriptions.isFetching} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={15} /></button></nav>}</> : <div className="ops-empty"><strong>{subscriptionSearch || statusFilter !== 'all' ? 'No matching subscriptions' : 'No subscription records'}</strong><p>{subscriptionSearch || statusFilter !== 'all' ? 'Try a different search term or status filter.' : 'Newly onboarded barangays receive a Free plan record.'}</p></div>}</div>}
    {selected && <>{selectedReviewReason && <div className="ops-panel subscription-review-context" role="status"><ShieldAlert size={18} /><div><strong>Review needed</strong><p>{selectedReviewReason}</p></div></div>}<form className="ops-panel ops-form subscription-editor" onSubmit={(event) => void submit(event)}><div className="ops-panel-heading"><div><h2>Manage {selected.barangay_name}</h2><p>Every update requires an audit note. This does not activate payment processing.</p></div><CreditCard size={18} /></div><div className="ops-form-grid"><div className="span-two subscription-current-dates" aria-label="Current subscription dates"><div><strong>Started</strong><span>{formatDateTime(selected.started_at)}</span></div><div><strong>Trial ends</strong><span>{selected.trial_ends_at ? formatDateTime(selected.trial_ends_at) : 'No trial deadline'}</span></div><div><strong>Grace period ends</strong><span>{selected.grace_ends_at ? formatDateTime(selected.grace_ends_at) : 'No grace deadline'}</span></div></div><label>Plan<select name="planKey" defaultValue={selected.plan_key}>{plans.data?.filter((plan) => plan.active || plan.key === selected.plan_key).map((plan) => <option key={plan.id} value={plan.key}>{plan.name}{plan.active ? '' : ' (inactive Ãƒâ€šÃ‚Â· existing subscribers only)'}</option>)}</select></label><label>Status<select name="status" defaultValue={selected.status}>{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Trial duration in days<input type="number" name="trialDays" min="1" max="90" defaultValue="14" /></label><label>Grace period in days<input type="number" name="graceDays" min="0" max="30" defaultValue="7" /></label><label className="span-two subscription-reset-dates"><input type="checkbox" name="resetDates" /><span>Reset the relevant dates from today</span></label><p className="span-two subscription-date-hint">When you keep the same plan and status, existing trial or grace deadlines are preserved unless you check this. Changing the plan or status starts new dates using the durations above.</p><label className="span-two">Administrative reason / note<textarea name="note" minLength={3} maxLength={1000} required defaultValue={selected.admin_note} /></label></div><div className="ops-form-actions"><button type="button" className="button outline" onClick={() => { setSelectedId(''); setSelectedSnapshot(null); setHistoryPage(0) }}>Cancel</button><button className="button primary" disabled={busy}>Save subscription record</button></div></form><section className="ops-panel subscription-history" aria-labelledby="subscription-history-title"><div className="ops-panel-heading subscription-history-heading"><div><h2 id="subscription-history-title">Change history</h2><p>Audited administrative changes for {selected.barangay_name}.</p></div><button type="button" className="button outline" disabled={!history.data?.total || exportingHistory || history.isFetching} onClick={() => void exportSubscriptionHistory()}><Download size={15} />{exportingHistory ? 'ExportingÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦' : 'Export history'}</button></div>{history.isPending && <LoadingNotice />}{history.error && <ErrorNotice message="Unable to load subscription history." onRetry={() => void history.refetch()} retrying={history.isFetching} />}{history.data?.total === 0 && !history.isPending && <p className="field-hint">No subscription changes have been recorded yet.</p>}{history.data && history.data.events.length > 0 && <ol className="subscription-history-list">{history.data.events.map((event) => <li key={event.id}><div><strong>{event.action === 'subscription_created' ? 'Subscription recorded' : 'Subscription updated'}</strong>{event.from_started_at && (event.from_started_at !== event.to_started_at || event.from_trial_ends_at !== event.to_trial_ends_at || event.from_grace_ends_at !== event.to_grace_ends_at) && <span className="subscription-date-changed">Dates changed</span>}<time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time></div><p>{event.from_plan ? `${event.from_plan} Ãƒâ€šÃ‚Â· ${event.from_status} ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ${event.to_plan} Ãƒâ€šÃ‚Â· ${event.to_status}` : `${event.to_plan} Ãƒâ€šÃ‚Â· ${event.to_status}`}</p>{event.from_started_at ? <div className="subscription-date-audit"><div><strong>Started</strong><span>{formatDateTime(event.from_started_at)} ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ {formatDateTime(event.to_started_at ?? '')}</span></div><div><strong>Trial end</strong><span>{event.from_trial_ends_at ? formatDateTime(event.from_trial_ends_at) : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'} ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ {event.to_trial_ends_at ? formatDateTime(event.to_trial_ends_at) : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</span></div><div><strong>Grace end</strong><span>{event.from_grace_ends_at ? formatDateTime(event.from_grace_ends_at) : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'} ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ {event.to_grace_ends_at ? formatDateTime(event.to_grace_ends_at) : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</span></div></div> : <small className="subscription-date-legacy">Date snapshots werenÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢t recorded for this older audit entry.</small>}<small>{event.note}</small></li>)}</ol>}{history.data && history.data.total > SUBSCRIPTION_EVENT_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Subscription history pages"><button type="button" className="button outline" disabled={historyPage === 0 || history.isFetching} onClick={() => setHistoryPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} />Previous</button><span className="field-hint">Page {historyPage + 1} of {Math.ceil(history.data.total / SUBSCRIPTION_EVENT_PAGE_SIZE)} Ãƒâ€šÃ‚Â· {history.data.total} changes</span><button type="button" className="button outline" disabled={(historyPage + 1) * SUBSCRIPTION_EVENT_PAGE_SIZE >= history.data.total || history.isFetching} onClick={() => setHistoryPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></nav>}</section></>}
    {pendingUpdate && selected && <ActionConfirmationDialog title={`Save subscription update for ${selected.barangay_name}?`} description={`${statusLabels[pendingUpdate.status] ?? pendingUpdate.status} Ãƒâ€šÃ‚Â· ${plans.data?.find((plan) => plan.key === pendingUpdate.planKey)?.name ?? pendingUpdate.planKey}. ${pendingUpdate.resetDates || pendingUpdate.planKey !== selected.plan_key || pendingUpdate.status !== selected.status ? 'Relevant dates will be recalculated from today using the entered durations.' : 'The current dates will be preserved.'} This records a manual administrative change only; it does not process a payment.`} confirmLabel="Save subscription" busy={busy} onCancel={() => setPendingUpdate(null)} onConfirm={() => void confirmSubscriptionUpdate()} />}
  </section>
}
