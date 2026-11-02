import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, Search, ShieldOff, UserRoundX } from 'lucide-react'
import { ActionConfirmationDialog } from '../../components/ActionConfirmationDialog'
import { ErrorNotice, LoadingNotice } from './shared'
import { listPlatformCaptainAccounts, PLATFORM_CAPTAIN_PAGE_SIZE, removePlatformCaptainAccount, type PlatformCaptainAccount } from './platform-data'

export function PlatformCaptainAccountsPanel() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [pendingRemoval, setPendingRemoval] = useState<PlatformCaptainAccount | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const accounts = useQuery({
    queryKey: ['platform-captain-accounts', page, search],
    queryFn: () => listPlatformCaptainAccounts(page, search),
  })
  const totalPages = Math.max(1, Math.ceil((accounts.data?.total ?? 0) / PLATFORM_CAPTAIN_PAGE_SIZE))

  useEffect(() => {
    // A removal can empty the last offset page; move back until a valid page is loaded.
    if (!accounts.isPending && !accounts.error && !accounts.data?.rows.length && page > 0) {
      setPage((current) => Math.max(0, current - 1))
    }
  }, [accounts.data, accounts.error, accounts.isPending, page])

  async function removeAccount() {
    if (!pendingRemoval) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await removePlatformCaptainAccount(pendingRemoval.user_id, reasons[pendingRemoval.user_id] ?? '')
      setSuccess(`Captain account for ${pendingRemoval.display_name} was removed. Its barangay access is suspended and its historical records are retained.`)
      setReasons((current) => ({ ...current, [pendingRemoval.user_id]: '' }))
      setPendingRemoval(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-captain-accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-barangays'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-barangay-summary'] }),
      ])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove this Captain account.')
      await queryClient.invalidateQueries({ queryKey: ['platform-captain-accounts'] })
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel platform-captain-management" aria-labelledby="platform-captain-accounts-title">
    <div className="panel-head"><div><h2 id="platform-captain-accounts-title">Captain accounts</h2><p>Remove a Captain login and suspend every barangay membership tied to that account.</p></div><UserRoundX size={19} /></div>
    <div className="platform-captain-warning"><AlertTriangle size={17} /><p>This action cannot be undone. The Auth account is soft-deleted; memberships, profiles, and barangay records remain so existing audit and ownership links stay intact. Other roles on the same account will also lose access.</p></div>
    {success && <div className="ops-success" role="status">{success}</div>}
    {error && <div className="platform-captain-error"><ErrorNotice message={error} /><details><summary>Removal details</summary><p>{error}</p></details></div>}
    <label className="archive-search platform-captain-search"><Search size={16} /><input type="search" maxLength={100} aria-label="Search Captain accounts" placeholder="Search Captain, email, or barangay" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} /></label>
    {accounts.isPending ? <LoadingNotice compact /> : accounts.error ? <ErrorNotice message="Captain accounts could not be loaded." onRetry={() => void accounts.refetch()} retrying={accounts.isFetching} /> : accounts.data?.rows.length ? <div className="platform-captain-list">
      {accounts.data.rows.map((account) => {
        const removalPending = Boolean(account.removal_started_at && !account.removal_completed_at)
        const reason = reasons[account.user_id] ?? ''
        return <article className="platform-captain-card" key={account.user_id}>
          <header><div><strong>{account.display_name}</strong><span>{account.email}</span></div><span className={`status-pill ${removalPending ? 'status-pending' : 'status-active'}`}>{removalPending ? 'Removal pending' : `${account.active_membership_count} active memberships`}</span></header>
          <p className="platform-captain-barangays">{account.barangays}</p>
          {removalPending && <p className="platform-captain-pending-note">Access is suspended. Retry to finish removing the Auth login.</p>}
          <label>Administrative reason<textarea rows={2} maxLength={1000} minLength={3} required value={reason} onChange={(event) => setReasons((current) => ({ ...current, [account.user_id]: event.target.value }))} placeholder="Reason for removing this account" /></label>
          <button type="button" className="button outline danger-action" disabled={busy || reason.trim().length < 3} onClick={() => { setError(''); setPendingRemoval(account) }}><ShieldOff size={15} />{removalPending ? 'Retry removal' : 'Remove Captain account'}</button>
        </article>
      })}
    </div> : <p className="field-hint">No Captain accounts match this search.</p>}
    {accounts.data && totalPages > 1 && <nav className="directory-pagination" aria-label="Captain account pages"><button type="button" className="button outline" disabled={page === 0 || accounts.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} />Previous</button><span>Page {page + 1} of {totalPages}</span><button type="button" className="button outline" disabled={page + 1 >= totalPages || accounts.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></nav>}
    {pendingRemoval && <ActionConfirmationDialog title={`Remove ${pendingRemoval.display_name}'s Captain account?`} description={`This deletes the Auth login, suspends all ${pendingRemoval.membership_count} barangay memberships for ${pendingRemoval.email}, and revokes pending invitations to that email. Existing profile and barangay records are retained for audit history. Reason: ${reasons[pendingRemoval.user_id]?.trim()}`} confirmLabel="Remove account" busy={busy} onCancel={() => setPendingRemoval(null)} onConfirm={() => void removeAccount()} />}
    <p className="platform-directory-privacy">Account removal history is visible only to platform administrators. Previous operational records remain attributed to their saved profile.</p>
  </section>
}
