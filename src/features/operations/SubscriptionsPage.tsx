import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { BadgeCheck, ChevronLeft, ChevronRight, CreditCard, Download, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'
import { getSubscriptionSummary, listSubscriptionEvents, listSubscriptionPage, listSubscriptionPlans, setSubscription, SUBSCRIPTION_EVENT_PAGE_SIZE, SUBSCRIPTION_PAGE_SIZE, type SubscriptionOverviewRow } from './subscriptions-data'
import { encodeCsv } from './csv'

const updateSchema = z.object({ planKey: z.string().min(1), status: z.enum(['free','trial','active','past_due','suspended','cancelled']), trialDays: z.coerce.number().int().min(1).max(90), graceDays: z.coerce.number().int().min(0).max(30), note: z.string().trim().min(3).max(1000) })
const statusLabels: Record<string,string> = { free: 'Free', trial: 'Trial', active: 'Active (manual)', past_due: 'Past due (manual)', suspended: 'Suspended (manual)', cancelled: 'Cancelled' }

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
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const selected = subscriptions.data?.rows.find((row) => row.barangay_id === selectedId) ?? selectedSnapshot ?? undefined
  const history = useQuery({ queryKey: ['subscription-events', selectedId, historyPage], queryFn: () => listSubscriptionEvents(selectedId, historyPage), enabled: Boolean(selectedId), staleTime: 30_000 })
  const rows = subscriptions.data?.rows ?? []
  const total = subscriptions.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / SUBSCRIPTION_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['platform-subscriptions'] }), queryClient.invalidateQueries({ queryKey: ['platform-subscription-summary'] }), queryClient.invalidateQueries({ queryKey: ['platform-barangays'] }), queryClient.invalidateQueries({ queryKey: ['platform-barangay-summary'] })])
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = event.currentTarget
    const parsed = updateSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the subscription update.'); return }
    if (parsed.data.status === 'free' && parsed.data.planKey !== 'free') { setError('Choose the Free plan when selecting Free status.'); return }
    if (parsed.data.status === 'trial' && parsed.data.planKey === 'free') { setError('A trial must use a paid plan entry.'); return }
    if (!window.confirm(`Save this admin-managed subscription update for ${selected.barangay_name}? No payment will be processed.`)) return
    setBusy(true); setError(''); setMessage('')
    try { await setSubscription({ barangayId: selected.barangay_id, planKey: parsed.data.planKey, status: parsed.data.status, trialDays: parsed.data.trialDays, graceDays: parsed.data.graceDays, note: parsed.data.note }); await refresh(); await queryClient.invalidateQueries({ queryKey: ['subscription-events', selected.barangay_id] }); setSelectedId(''); setSelectedSnapshot(null); setMessage('Subscription record updated and audit history recorded.') }
    catch { setError('Unable to update this subscription. Refresh and try again.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Subscriptions & plans" description="Review plan metadata and manually manage trial or account status records.">
      <button className="button outline" disabled={subscriptions.isFetching || plans.isFetching || summary.isFetching} onClick={() => { void subscriptions.refetch(); void plans.refetch(); void summary.refetch() }}><RefreshCw size={15} />Refresh</button>
    </PageHeading>
    <div className="ops-panel subscription-notice"><ShieldAlert size={19} /><p><strong>Billing is not connected.</strong> Status changes here are manual administrative records; they do not process payments or restrict workspace access. Plan entitlements are catalog metadata and are not enforced yet.</p></div>
    {message && <div className="ops-success"><BadgeCheck size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    <div className="subscription-summary"><div><strong>{summary.data?.barangay_count ?? '—'}</strong><span>Barangays</span></div><div><strong>{summary.data?.active_trial_count ?? '—'}</strong><span>Trials in period</span></div><div><strong>{summary.data?.elapsed_trial_count ?? '—'}</strong><span>Trial elapsed · review</span></div><div><strong>{summary.data?.past_due_count ?? '—'}</strong><span>Past due · manual</span></div><div><strong>{summary.data?.suspended_count ?? '—'}</strong><span>Manually suspended</span></div></div>
    {plans.isPending && <LoadingNotice />}{plans.error && <ErrorNotice message="Unable to load subscription plans." onRetry={() => void plans.refetch()} retrying={plans.isFetching} />}
    {plans.data && <section className="subscription-plan-section"><div className="ops-panel-heading"><div><h2>Plan catalog</h2><p>No prices or feature package has been configured.</p></div><CreditCard size={18} /></div><div className="subscription-plan-list">{plans.data.map((plan) => {
      const entitlementKeys = Object.entries(plan.entitlements ?? {}).filter(([, value]) => Boolean(value)).map(([key]) => key)
      return <article className="ops-panel subscription-plan" key={plan.id}><header><h3>{plan.name}</h3><span className={`status-pill ${plan.active ? 'status-active' : 'status-archived'}`}>{plan.active ? 'Available' : 'Inactive'}</span></header><p>{plan.description}</p><small>Plan key: {plan.key}</small><div className="subscription-entitlements"><strong>Configured entitlements</strong>{entitlementKeys.length ? <ul>{entitlementKeys.map((key) => <li key={key}>{key.replaceAll('_',' ')}</li>)}</ul> : <span>Not configured</span>}</div></article>
    })}</div></section>}
    {subscriptions.isPending && <LoadingNotice />}{subscriptions.error && <ErrorNotice message="Unable to load subscription records." onRetry={() => void subscriptions.refetch()} retrying={subscriptions.isFetching} />}
    {subscriptions.data && <div className="subscription-table-section"><div className="platform-directory-controls subscription-table-controls"><label className="archive-search"><Search size={17} /><input aria-label="Search subscriptions" placeholder="Search barangay, code, or plan" value={subscriptionSearch} onChange={(event) => { setSubscriptionSearch(event.target.value); setPage(0) }} /></label><label className="archive-folder-select">Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0) }}><option value="all">All statuses</option><option value="needs_review">Needs review</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><span className="field-hint" aria-live="polite">Showing {total ? currentPage * SUBSCRIPTION_PAGE_SIZE + 1 : 0}–{Math.min((currentPage + 1) * SUBSCRIPTION_PAGE_SIZE, total)} of {total} barangays</span><button type="button" className="button outline" disabled={!total || exporting || subscriptions.isFetching} onClick={() => void exportSubscriptions()}><Download size={15} />{exporting ? 'Exporting…' : 'Export matching rows'}</button></div>{total ? <><div className="ops-table-wrap subscription-table-wrap"><table className="ops-table subscription-table"><thead><tr><th>Barangay</th><th>Plan</th><th>Admin-managed status</th><th>Trial end</th><th>Grace end</th><th>Updated</th><th /></tr></thead><tbody>{rows.map((row) => {
      const trialElapsed = row.status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at).getTime() <= Date.now()
      const graceElapsed = row.status === 'past_due' && row.grace_ends_at && new Date(row.grace_ends_at).getTime() <= Date.now()
      return <tr key={row.barangay_id}><td><strong>{row.barangay_name}</strong><small>{row.barangay_code}</small></td><td>{row.plan_name}</td><td><StatusPill status={row.status} /><small>{trialElapsed ? 'Trial elapsed · manual review required' : graceElapsed ? 'Grace elapsed · manual review required' : statusLabels[row.status]}</small></td><td>{row.trial_ends_at ? formatDateTime(row.trial_ends_at) : '—'}</td><td>{row.grace_ends_at ? formatDateTime(row.grace_ends_at) : '—'}</td><td>{formatDateTime(row.updated_at)}</td><td><button className="button outline" onClick={() => { setSelectedId(row.barangay_id); setSelectedSnapshot(row); setHistoryPage(0); setError(''); setMessage('') }}>Manage</button></td></tr>
    })}</tbody></table></div><div className="subscription-cards">{rows.map((row) => {
      const trialElapsed = row.status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at).getTime() <= Date.now()
      const graceElapsed = row.status === 'past_due' && row.grace_ends_at && new Date(row.grace_ends_at).getTime() <= Date.now()
      return <article className="subscription-card" key={row.barangay_id}><header><div><strong>{row.barangay_name}</strong><small>{row.barangay_code}</small></div><StatusPill status={row.status} /></header><dl><div><dt>Plan</dt><dd>{row.plan_name}</dd></div><div><dt>Trial ends</dt><dd>{row.trial_ends_at ? formatDateTime(row.trial_ends_at) : '—'}</dd></div><div><dt>Grace period ends</dt><dd>{row.grace_ends_at ? formatDateTime(row.grace_ends_at) : '—'}</dd></div><div><dt>Last updated</dt><dd>{formatDateTime(row.updated_at)}</dd></div></dl><p>{trialElapsed ? 'Trial elapsed · manual review required' : graceElapsed ? 'Grace period elapsed · manual review required' : statusLabels[row.status]}</p><button type="button" className="button outline" onClick={() => { setSelectedId(row.barangay_id); setSelectedSnapshot(row); setHistoryPage(0); setError(''); setMessage('') }}>Manage subscription</button></article>
    })}</div>{pageCount > 1 && <nav className="directory-pagination" aria-label="Subscription pages"><button type="button" className="button outline" disabled={currentPage === 0 || subscriptions.isFetching} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} />Previous</button><span aria-live="polite">Page {currentPage + 1} of {pageCount}</span><button type="button" className="button outline" disabled={currentPage + 1 === pageCount || subscriptions.isFetching} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={15} /></button></nav>}</> : <div className="ops-empty"><strong>{subscriptionSearch || statusFilter !== 'all' ? 'No matching subscriptions' : 'No subscription records'}</strong><p>{subscriptionSearch || statusFilter !== 'all' ? 'Try a different search term or status filter.' : 'Newly onboarded barangays receive a Free plan record.'}</p></div>}</div>}
    {selected && <><form className="ops-panel ops-form subscription-editor" onSubmit={(event) => void submit(event)}><div className="ops-panel-heading"><div><h2>Manage {selected.barangay_name}</h2><p>Every update requires an audit note. This does not activate payment processing.</p></div><CreditCard size={18} /></div><div className="ops-form-grid"><label>Plan<select name="planKey" defaultValue={selected.plan_key}>{plans.data?.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.key}>{plan.name}</option>)}</select></label><label>Status<select name="status" defaultValue={selected.status}>{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Trial duration in days<input type="number" name="trialDays" min="1" max="90" defaultValue="14" /></label><label>Grace period in days<input type="number" name="graceDays" min="0" max="30" defaultValue="7" /></label><label className="span-two">Administrative reason / note<textarea name="note" minLength={3} maxLength={1000} required defaultValue={selected.admin_note} /></label></div><div className="ops-form-actions"><button type="button" className="button outline" onClick={() => { setSelectedId(''); setSelectedSnapshot(null); setHistoryPage(0) }}>Cancel</button><button className="button primary" disabled={busy}>Save subscription record</button></div></form><section className="ops-panel subscription-history" aria-labelledby="subscription-history-title"><div className="ops-panel-heading"><div><h2 id="subscription-history-title">Change history</h2><p>Audited administrative changes for {selected.barangay_name}.</p></div></div>{history.isPending && <LoadingNotice />}{history.error && <ErrorNotice message="Unable to load subscription history." onRetry={() => void history.refetch()} retrying={history.isFetching} />}{history.data?.total === 0 && !history.isPending && <p className="field-hint">No subscription changes have been recorded yet.</p>}{history.data && history.data.events.length > 0 && <ol className="subscription-history-list">{history.data.events.map((event) => <li key={event.id}><div><strong>{event.action === 'subscription_created' ? 'Subscription recorded' : 'Subscription updated'}</strong><time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time></div><p>{event.from_plan ? `${event.from_plan} · ${event.from_status} → ${event.to_plan} · ${event.to_status}` : `${event.to_plan} · ${event.to_status}`}</p><small>{event.note}</small></li>)}</ol>}{history.data && history.data.total > SUBSCRIPTION_EVENT_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Subscription history pages"><button type="button" className="button outline" disabled={historyPage === 0 || history.isFetching} onClick={() => setHistoryPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} />Previous</button><span className="field-hint">Page {historyPage + 1} of {Math.ceil(history.data.total / SUBSCRIPTION_EVENT_PAGE_SIZE)} · {history.data.total} changes</span><button type="button" className="button outline" disabled={(historyPage + 1) * SUBSCRIPTION_EVENT_PAGE_SIZE >= history.data.total || history.isFetching} onClick={() => setHistoryPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></nav>}</section></>}
  </section>
}
