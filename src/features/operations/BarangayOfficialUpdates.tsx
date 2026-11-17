import { useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { supabase } from '../../lib/supabase'
import { ErrorNotice, LoadingNotice, StatusPill } from './shared'
import { formatDateTime } from './format'
import { getBarangayPlanFeatures } from './subscriptions-data'

type OfficialUpdate = {
  id: string
  update_type: 'upcoming_project' | 'accomplishment' | 'progress'
  author_role_key: 'captain' | 'secretary' | 'treasurer' | 'kagawad' | 'sk_chairperson' | 'bhw' | 'tanod' | 'barangay_official'
  title: string
  body: string
  created_at: string
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

const typeLabel: Record<OfficialUpdate['update_type'], string> = {
  upcoming_project: 'Upcoming project',
  accomplishment: 'Accomplishment',
  progress: 'Progress update',
}

const roleLabel: Record<OfficialUpdate['author_role_key'], string> = {
  captain: 'Barangay Captain',
  secretary: 'Barangay Secretary',
  treasurer: 'Barangay Treasurer',
  kagawad: 'Barangay Kagawad',
  sk_chairperson: 'SK Chairperson',
  bhw: 'Barangay Health Worker',
  tanod: 'Barangay Tanod',
  barangay_official: 'Barangay official',
}

export function BarangayOfficialUpdates() {
  const { membership, user } = useAuth()
  const barangayId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const actionInFlight = useRef(false)
  const [page, setPage] = useState(0)
  const planFeatures = useQuery({
    queryKey: ['barangay-plan-features', barangayId],
    queryFn: () => getBarangayPlanFeatures(barangayId),
    enabled: Boolean(barangayId),
    staleTime: 5 * 60_000,
  })
  const hasCommunityPrograms = !planFeatures.isError && planFeatures.data?.community_programs === true
  const canPost = useQuery({
    queryKey: ['permission', user?.id ?? 'signed-out', barangayId, 'barangay.public_update.create'],
    queryFn: () => hasPermission(barangayId, 'barangay.public_update.create'),
    enabled: Boolean(barangayId && hasCommunityPrograms),
  })
  const canModerate = useQuery({
    queryKey: ['permission', user?.id ?? 'signed-out', barangayId, 'barangay.public_update.moderate'],
    queryFn: () => hasPermission(barangayId, 'barangay.public_update.moderate'),
    enabled: Boolean(barangayId && hasCommunityPrograms),
  })
  const updates = useQuery({
    queryKey: ['barangay-official-public-updates', barangayId, page],
    queryFn: async () => {
      const pageSize = 20
      const start = page * pageSize
      const { data, error } = await client().from('barangay_official_public_updates')
        .select('id,update_type,author_role_key,title,body,created_at')
        .eq('barangay_id', barangayId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(start, start + pageSize)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as OfficialUpdate[]
      return { items: rows.slice(0, pageSize), hasNextPage: rows.length > pageSize }
    },
    enabled: Boolean(barangayId && hasCommunityPrograms),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [withdrawingId, setWithdrawingId] = useState('')

  async function withdraw(updateId: string) {
    if (actionInFlight.current) return
    if (!window.confirm('Withdraw this update from the barangay member feed? The update will be hidden, with its history retained.')) return
    actionInFlight.current = true
    setWithdrawingId(updateId); setError(''); setMessage('')
    try {
      const { error: rpcError } = await client().rpc('withdraw_barangay_official_public_update', { p_update_id: updateId })
      if (rpcError) throw new Error(rpcError.message)
      setPage(0)
      await queryClient.invalidateQueries({ queryKey: ['barangay-official-public-updates', barangayId] })
      setMessage('The update was withdrawn from the member feed.')
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
      const { error: rpcError } = await client().rpc('create_barangay_official_public_update_confirmed', {
        p_barangay_id: barangayId,
        p_update_type: String(values.get('type') ?? ''),
        p_title: String(values.get('title') ?? ''),
        p_body: String(values.get('body') ?? ''),
        p_confirmed_public: values.get('publicConfirmation') === 'on',
      })
      if (rpcError) throw new Error(rpcError.message)
      form.reset()
      setPage(0)
      await queryClient.invalidateQueries({ queryKey: ['barangay-official-public-updates', barangayId] })
      setMessage('Update published for residents and barangay officials.')
    } catch (err) { setError(err instanceof Error ? err.message : 'The update could not be published.') }
    finally { actionInFlight.current = false; setBusy(false) }
  }

  if (!barangayId) return null
  return <section className="ops-panel barangay-official-updates">
    <div className="ops-panel-heading"><div><h2>Barangay progress for residents</h2><p>Share project plans, accomplishments, and progress in plain text. Do not include confidential details or attach files.</p></div><Megaphone size={19} /></div>
    {planFeatures.isPending && <LoadingNotice compact />}
    {planFeatures.error && <ErrorNotice message="Community Programs access could not be checked. Public updates are unavailable until the plan check succeeds." onRetry={() => void planFeatures.refetch()} retrying={planFeatures.isFetching} />}
    {planFeatures.isSuccess && !hasCommunityPrograms && <p className="field-hint" role="status">Public project and accomplishment updates require an active Community Programs subscription.</p>}
    {hasCommunityPrograms && <>
    {canPost.data && <form className="ops-form" onSubmit={(event) => void publish(event)}>
      <div className="ops-form-grid"><label>Update type<select name="type" defaultValue="progress"><option value="upcoming_project">Upcoming project</option><option value="progress">Project progress</option><option value="accomplishment">Accomplishment</option></select></label>
        <label className="span-two">Title<input name="title" minLength={3} maxLength={160} required placeholder="What should the community know?" /></label>
        <label className="span-two">Details<textarea name="body" minLength={3} maxLength={3000} rows={4} required placeholder="Describe the plan, work completed, or current progress." /></label></div>
      <label className="checkbox-label"><input type="checkbox" name="publicConfirmation" required />I confirm this update is suitable for all active barangay members and contains no personal, medical, financial, or case details.</label>
      <p className="field-hint">This public post is text only. Keep personal, financial, and case details private.</p>
      {error && <p className="ops-error" role="alert">{error}</p>}{message && <p className="ops-success" role="status">{message}</p>}
      <button className="button primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish update'}</button>
    </form>}
    {canPost.error && <ErrorNotice message="Public update access could not be checked. Posting is unavailable until access is confirmed." onRetry={() => void canPost.refetch()} retrying={canPost.isFetching} />}
    {canModerate.error && <ErrorNotice message="Update moderation access could not be checked. Withdraw controls are unavailable until access is confirmed." onRetry={() => void canModerate.refetch()} retrying={canModerate.isFetching} />}
    {updates.isPending ? <LoadingNotice compact /> : updates.error ? <ErrorNotice message="Barangay public updates could not be loaded." onRetry={() => void updates.refetch()} retrying={updates.isFetching} /> : updates.data?.items.length ? <ol className="public-finance-update-list">{updates.data.items.map((item) => <li key={item.id}><article>
      <StatusPill status={typeLabel[item.update_type]} /><h3>{item.title}</h3><p>{item.body}</p><small>Posted by {roleLabel[item.author_role_key] ?? 'Barangay official'}</small><br /><time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
      {canModerate.data && <div className="public-update-actions"><button type="button" className="button outline" disabled={Boolean(withdrawingId)} onClick={() => void withdraw(item.id)}>{withdrawingId === item.id ? 'Withdrawing…' : 'Withdraw update'}</button></div>}
    </article></li>)}</ol> : <p className="field-hint">{page ? 'No more official updates on this page.' : 'No official updates have been shared yet.'}</p>}
    <div className="committee-picker-pagination"><span>Page {page + 1}</span><div><button type="button" className="button outline" disabled={page === 0 || updates.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button><button type="button" className="button outline" disabled={!updates.data?.hasNextPage || updates.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>
    </>}
  </section>
}
