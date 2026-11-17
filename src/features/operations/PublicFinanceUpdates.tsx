import { useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { supabase } from '../../lib/supabase'
import { ErrorNotice, LoadingNotice } from './shared'
import { formatDateTime } from './format'
import { getBarangayPlanFeatures } from './subscriptions-data'

type PublicFinanceUpdate = { id: string; title: string; body: string; created_at: string }

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export function PublicFinanceUpdates() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const actionInFlight = useRef(false)
  const [page, setPage] = useState(0)
  const planFeatures = useQuery({
    queryKey: ['barangay-plan-features', tenantId],
    queryFn: () => getBarangayPlanFeatures(tenantId),
    enabled: Boolean(tenantId),
    staleTime: 5 * 60_000,
  })
  const hasFinance = !planFeatures.isError && planFeatures.data?.finance === true
  const canPublish = useQuery({
    queryKey: ['permission', user?.id ?? 'signed-out', tenantId, 'finance.public_update'],
    queryFn: () => hasPermission(tenantId, 'finance.public_update'),
    enabled: Boolean(tenantId && hasFinance),
    staleTime: 60_000,
  })
  const canModerate = useQuery({
    queryKey: ['permission', user?.id ?? 'signed-out', tenantId, 'finance.public_update.moderate'],
    queryFn: () => hasPermission(tenantId, 'finance.public_update.moderate'),
    enabled: Boolean(tenantId && hasFinance),
  })
  const updates = useQuery({
    queryKey: ['public-finance-updates', tenantId, page],
    queryFn: async () => {
      const pageSize = 20
      const start = page * pageSize
      const { data, error } = await client().from('barangay_finance_public_updates')
        .select('id,title,body,created_at').eq('barangay_id', tenantId)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(start, start + pageSize)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as PublicFinanceUpdate[]
      return { items: rows.slice(0, pageSize), hasNextPage: rows.length > pageSize }
    },
    enabled: Boolean(tenantId && hasFinance),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [withdrawingId, setWithdrawingId] = useState('')

  async function withdraw(updateId: string) {
    if (actionInFlight.current) return
    if (!window.confirm('Withdraw this finance update from the barangay member feed? The update will be hidden, with its history retained.')) return
    actionInFlight.current = true
    setWithdrawingId(updateId); setError(''); setMessage('')
    try {
      const { error: rpcError } = await client().rpc('withdraw_barangay_finance_public_update', { p_update_id: updateId })
      if (rpcError) throw new Error(rpcError.message)
      setPage(0)
      await queryClient.invalidateQueries({ queryKey: ['public-finance-updates', tenantId] })
      setMessage('The finance update was withdrawn from the member feed.')
    } catch (err) { setError(err instanceof Error ? err.message : 'The update could not be withdrawn.') }
    finally { actionInFlight.current = false; setWithdrawingId('') }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (actionInFlight.current) return
    actionInFlight.current = true
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: rpcError } = await client().rpc('publish_barangay_finance_update_confirmed', {
        p_barangay_id: tenantId, p_title: String(values.get('title') ?? ''), p_body: String(values.get('body') ?? ''),
        p_confirmed_public: values.get('publicConfirmation') === 'on',
      })
      if (rpcError) throw new Error(rpcError.message)
      form.reset()
      setPage(0)
      await queryClient.invalidateQueries({ queryKey: ['public-finance-updates', tenantId] })
      setMessage('Public finance update posted.')
    } catch (err) { setError(err instanceof Error ? err.message : 'The update could not be published.') }
    finally { actionInFlight.current = false; setBusy(false) }
  }

  if (!tenantId) return null
  return <section className="ops-panel public-finance-updates">
    <div className="ops-panel-heading"><div><h2>Barangay finance updates</h2><p>Share clear, non-confidential summaries for residents and barangay officials. Never include personal or sensitive financial details.</p></div><FileText size={19} /></div>
    {planFeatures.isPending && <LoadingNotice compact />}
    {planFeatures.error && <ErrorNotice message="Finance subscription access could not be checked. Finance updates are unavailable until the plan check succeeds." onRetry={() => void planFeatures.refetch()} retrying={planFeatures.isFetching} />}
    {planFeatures.isSuccess && !hasFinance && <p className="field-hint" role="status">Public finance updates require an active Finance subscription.</p>}
    {hasFinance && <>
    {canPublish.data && <form className="ops-form" onSubmit={(event) => void publish(event)}>
      <label>Update title<input name="title" minLength={3} maxLength={160} required placeholder="Example: Q3 budget summary" /></label>
      <label>Public update<textarea name="body" minLength={3} maxLength={2000} rows={4} required placeholder="Summarize available budget, income, or an important finance notice." /></label>
      <label className="checkbox-label"><input type="checkbox" name="publicConfirmation" required />I confirm this is suitable for all active barangay members and contains no personal, account, receipt, or other confidential details.</label>
      <p className="field-hint">Text only. No files or receipts are collected here.</p>
      {error && <p className="ops-error" role="alert">{error}</p>}{message && <p className="ops-success" role="status">{message}</p>}
      <button className="button primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish update'}</button>
    </form>}
    {canPublish.error && <ErrorNotice message="Public finance update access could not be checked. Publishing is unavailable until access is confirmed." onRetry={() => void canPublish.refetch()} retrying={canPublish.isFetching} />}
    {canModerate.error && <ErrorNotice message="Finance update moderation access could not be checked. Withdraw controls are unavailable until access is confirmed." onRetry={() => void canModerate.refetch()} retrying={canModerate.isFetching} />}
    {updates.isPending ? <LoadingNotice compact /> : updates.error ? <ErrorNotice message="Public finance updates could not be loaded." onRetry={() => void updates.refetch()} retrying={updates.isFetching} /> : updates.data?.items.length ? <ol className="public-finance-update-list">{updates.data.items.map((item) => <li key={item.id}><article><h3>{item.title}</h3><p>{item.body}</p><small>Posted by the Barangay Treasurer</small><br /><time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
      {canModerate.data && <div className="public-update-actions"><button type="button" className="button outline" disabled={Boolean(withdrawingId)} onClick={() => void withdraw(item.id)}>{withdrawingId === item.id ? 'Withdrawing…' : 'Withdraw update'}</button></div>}
    </article></li>)}</ol> : <p className="field-hint">{page ? 'No more finance updates on this page.' : 'No public finance updates have been posted.'}</p>}
    <div className="committee-picker-pagination"><span>Page {page + 1}</span><div><button type="button" className="button outline" disabled={page === 0 || updates.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button><button type="button" className="button outline" disabled={!updates.data?.hasNextPage || updates.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>
    </>}
  </section>
}
