import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Building2, ClipboardCheck } from 'lucide-react'
import { createLguAdministratorInvitation, listPlatformLguDirectory, PLATFORM_LGU_DIRECTORY_PAGE_SIZE, type PlatformLguRow } from './platform-data'
import { ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const schema = z.object({
  municipality: z.string().trim().min(2).max(120),
  province: z.string().trim().min(2).max(120),
  email: z.email(),
})

export function OnboardingPage() {
  const queryClient = useQueryClient()
  const [lguSearch, setLguSearch] = useState('')
  const [lguSearchTerm, setLguSearchTerm] = useState('')
  const [lguPage, setLguPage] = useState(0)
  const lgus = useQuery({ queryKey: ['platform-lgu-directory', lguPage, lguSearchTerm], queryFn: () => listPlatformLguDirectory(lguPage, lguSearchTerm) })
  const lguTotal = Number(lgus.data?.total_count ?? 0)
  const lguPages = Math.ceil(lguTotal / PLATFORM_LGU_DIRECTORY_PAGE_SIZE)
  useEffect(() => {
    const timeout = window.setTimeout(() => { setLguPage(0); setLguSearchTerm(lguSearch.trim()) }, 250)
    return () => window.clearTimeout(timeout)
  }, [lguSearch])
  useEffect(() => { if (lguPage >= lguPages) setLguPage(Math.max(0,lguPages - 1)) }, [lguPage,lguPages])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [reissuedInvite, setReissuedInvite] = useState<{ lguId: string; url: string; expiresAt: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = schema.safeParse(Object.fromEntries(new FormData(form).entries()))
    setError(''); setMessage(''); setInviteUrl('')
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the municipality and administrator details.'); return }
    setBusy(true)
    try {
      const result = await createLguAdministratorInvitation(parsed.data)
      const url = new URL('/accept-invitation', window.location.origin)
      url.searchParams.set('token', result.invitation_token)
      setInviteUrl(url.toString())
      setExpiresAt(result.expires_at)
      setMessage('LGU workspace prepared. Send this email-bound invitation to its administrator. After accepting, they can create barangay workspaces and invite each Captain.')
      form.reset()
      await queryClient.invalidateQueries({ queryKey: ['platform-lgu-directory'] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create the LGU invitation.') }
    finally { setBusy(false) }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(inviteUrl); setMessage('LGU invitation link copied. Deliver it through an approved channel.') }
    catch { setError('Clipboard access is unavailable. Select and copy the link below.') }
  }

  async function reissueInvitation(lgu: PlatformLguRow) {
    if (!lgu.pending_invited_email) return
    setError(''); setMessage(''); setInviteUrl(''); setReissuedInvite(null); setBusy(true)
    try {
      const result = await createLguAdministratorInvitation({ municipality: lgu.municipality, province: lgu.province, email: lgu.pending_invited_email })
      const url = new URL('/accept-invitation', window.location.origin)
      url.searchParams.set('token', result.invitation_token)
      setReissuedInvite({ lguId: lgu.lgu_id, url: url.toString(), expiresAt: result.expires_at })
      setMessage(`A replacement LGU invitation was prepared for ${lgu.pending_invited_email}. The previous pending link is now invalid.`)
      await queryClient.invalidateQueries({ queryKey: ['platform-lgu-directory'] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to prepare a replacement LGU invitation.') }
    finally { setBusy(false) }
  }

  async function copyReissuedInvitation() {
    if (!reissuedInvite) return
    try { await navigator.clipboard.writeText(reissuedInvite.url); setMessage('Replacement LGU invitation link copied. Deliver it through an approved channel.') }
    catch { setError('Clipboard access is unavailable. Select and copy the replacement link below.') }
  }

  return <section className="operation-page">
    <PageHeading title="Municipality onboarding" description="Create an LGU workspace and invite its administrator. Barangay workspaces and Captain invitations are managed by the LGU." />
    {message && <div className="ops-success" role="status"><ClipboardCheck size={16} />{message}</div>}
    {error && <ErrorNotice message={error} />}
    <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>New municipality LGU</h2><p>Each municipality and province combination has one LGU workspace.</p></div><Building2 size={18} /></div>
      <div className="ops-form-grid">
        <label>Municipality or city<input name="municipality" required maxLength={120} /></label>
        <label>Province<input name="province" required maxLength={120} /></label>
        <label className="span-two">LGU administrator email<input type="email" name="email" required autoComplete="email" /></label>
      </div>
      <div className="ops-form-actions"><span className="field-hint">No email is sent. The invitation expires after seven days.</span><button className="button primary" disabled={busy}>{busy ? 'Preparing LGU…' : 'Create LGU invitation'}</button></div>
      {inviteUrl && <div className="invite-link-box"><label>LGU administrator invitation<input readOnly value={inviteUrl} /><span className="field-hint">Expires {new Date(expiresAt).toLocaleString()}</span></label><button type="button" className="button outline" onClick={() => void copy()}><ClipboardCheck size={15} />Copy link</button></div>}
    </form>
    <section className="ops-panel"><div className="ops-panel-heading"><div><h2>How onboarding works</h2><p>The LGU administrator creates one workspace for each barangay and provides the first Captain’s email. The Captain accepts their invitation before accessing that barangay.</p></div></div></section>
    <section className="ops-panel" aria-labelledby="platform-lgu-directory-title"><div className="ops-panel-heading"><div><h2 id="platform-lgu-directory-title">Municipality LGU directory</h2><p>Check administrator invitation status and barangay workspace totals.</p></div><button className="button outline" type="button" disabled={lgus.isFetching} onClick={() => void lgus.refetch()}>Refresh</button></div>
      <label className="platform-lgu-search">Search municipalities<input type="search" value={lguSearch} maxLength={160} onChange={(event) => { setLguSearch(event.target.value); setLguPage(0) }} placeholder="Municipality or province" /></label>
      {lgus.isPending ? <LoadingNotice /> : lgus.error ? <ErrorNotice message="Municipality LGUs could not be loaded." onRetry={() => void lgus.refetch()} retrying={lgus.isFetching} /> : lguTotal ? lgus.data?.rows.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Municipality</th><th>Province</th><th>Barangays</th><th>Administrator</th><th>Workspace</th><th>Created</th></tr></thead><tbody>{lgus.data.rows.map((lgu) => <tr key={lgu.lgu_id}><td>{lgu.municipality}</td><td>{lgu.province}</td><td>{Number(lgu.barangay_count).toLocaleString()}</td><td>{lgu.administrator_active ? 'Active' : lgu.pending_invited_email ? <>{lgu.pending_invited_email}<small className="field-hint">Invitation expires {new Date(lgu.pending_invitation_expires_at ?? '').toLocaleDateString()}</small><button type="button" className="button outline" disabled={busy} onClick={() => void reissueInvitation(lgu)}>{busy ? 'Preparing…' : 'Reissue invitation'}</button>{reissuedInvite?.lguId === lgu.lgu_id && <div className="invite-link-box"><label>Replacement invitation<input readOnly value={reissuedInvite.url} /><span className="field-hint">Expires {new Date(reissuedInvite.expiresAt).toLocaleString()}</span></label><button type="button" className="button outline" onClick={() => void copyReissuedInvitation()}>Copy link</button></div>}</> : 'No active invitation'}</td><td><StatusPill status={lgu.status} /></td><td>{new Date(lgu.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div> : null : <p className="field-hint">{lguSearchTerm ? 'No municipality workspaces match this search.' : 'No municipality LGUs yet. Create the first one above.'}</p>}
      {lguPages > 1 && <nav className="directory-pagination" aria-label="Municipality directory pages"><button type="button" className="button outline" disabled={lguPage === 0 || lgus.isFetching} onClick={() => setLguPage((value) => Math.max(0,value - 1))}>Previous</button><span>Page {lguPage + 1} of {lguPages} · {lguTotal.toLocaleString()} municipalities</span><button type="button" className="button outline" disabled={lguPage + 1 >= lguPages || lgus.isFetching} onClick={() => setLguPage((value) => value + 1)}>Next</button></nav>}
    </section>
  </section>
}
