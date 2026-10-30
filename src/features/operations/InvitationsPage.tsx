import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Clipboard, UserPlus, XCircle } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { createInvitation, hasPermission, listInvitationPage, revokeInvitation, INVITATION_PAGE_SIZE } from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const invitationSchema = z.object({
  email: z.email(),
  role: z.enum(['secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident']),
})

export function InvitationsPage() {
  const { membership } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const invitations = useQuery({ queryKey: ['invitations', tenantId, page], queryFn: () => listInvitationPage(tenantId, page), enabled: Boolean(tenantId) })
  const canInvite = useQuery({ queryKey: ['permission', tenantId, 'membership.invite'], queryFn: () => hasPermission(tenantId, 'membership.invite'), enabled: Boolean(tenantId) })
  const [inviteUrl, setInviteUrl] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess(''); setInviteUrl('')
    const form = event.currentTarget
    const fields = Object.fromEntries(new FormData(form).entries())
    const parsed = invitationSchema.safeParse(fields)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the invitation details.'); return }
    setBusy(true)
    try {
      const created = await createInvitation(tenantId, parsed.data.email, parsed.data.role)
      const url = new URL('/accept-invitation', window.location.origin)
      url.searchParams.set('token', created.invitation_token)
      setInviteUrl(url.toString())
      setSuccess('Invitation link created. It expires in 7 days and can only be accepted by the invited email address.')
      await queryClient.invalidateQueries({ queryKey: ['invitations', tenantId] })
      setPage(0)
      form.reset()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create this invitation.') }
    finally { setBusy(false) }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(inviteUrl); setSuccess('Invitation link copied. Send it only to the invited person.') }
    catch { setError('Clipboard access is unavailable. Select and copy the link below.') }
  }

  async function revoke(id: string, email: string) {
    if (!window.confirm(`Revoke the unused invitation for ${email}? Its link will stop working.`)) return
    setError(''); setSuccess('')
    try {
      await revokeInvitation(id)
      await queryClient.invalidateQueries({ queryKey: ['invitations', tenantId] })
      setSuccess('Invitation revoked. The link can no longer be accepted.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to revoke this invitation.') }
  }

  return <section className="operation-page">
    <PageHeading title="Official invitations" description="Invite people into this barangay with a role-limited, expiring access link." />
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to manage official invitations." />}
    {Boolean(tenantId) && canInvite.isPending && <LoadingNotice compact />}
    {canInvite.error && <ErrorNotice message="Invitation permission could not be checked. Refresh the page or contact your barangay administrator." />}
    {Boolean(tenantId) && !canInvite.isPending && !canInvite.error && !canInvite.data && <div className="ops-panel"><strong>Invitation access is restricted</strong><p>Your current role cannot invite members to this barangay.</p></div>}
    {canInvite.data && <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>Create an invitation</h2><p>No email is sent by this app. Deliver the generated link through your approved channel.</p></div><UserPlus size={18} /></div>
      <div className="ops-form-grid"><label>Email address<input type="email" name="email" autoComplete="email" required /></label>
        <label>Assigned role<select name="role" defaultValue=""><option value="" disabled>Select a role</option><option value="secretary">Barangay Secretary</option><option value="treasurer">Barangay Treasurer</option><option value="kagawad">Barangay Kagawad</option><option value="sk_chairperson">SK Chairperson</option><option value="bhw">Barangay Health Worker</option><option value="tanod">Barangay Tanod</option><option value="resident">Resident</option></select></label></div>
      <div className="ops-form-actions"><span className="field-hint">The invited person must sign in using this email address.</span><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create invite'}</button></div>
      {error && <ErrorNotice message={error} />}{success && <div className="ops-success">{success}</div>}
      {inviteUrl && <div className="invite-link-box"><label>One-time invitation link<input readOnly value={inviteUrl} /></label><button type="button" className="button outline" onClick={() => void copyLink()}><Clipboard size={15} />Copy link</button></div>}
    </form>}
    {error && !canInvite.data && <ErrorNotice message={error} />}
    <div className="ops-section-title"><h2>Recent invitations</h2><p>Invitation tokens are never listed or shown again after creation.</p></div>
    {!tenantId ? null : invitations.isPending ? <LoadingNotice /> : invitations.error ? <ErrorNotice message={invitations.error.message} /> : invitations.data?.total ? invitations.data.invitations.length ?
      <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Email</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead><tbody>
        {invitations.data.invitations.map((invite) => {
          const expired = invite.status === 'pending' && new Date(invite.expires_at).getTime() <= Date.now()
          return <tr key={invite.id}><td>{invite.invited_email}</td><td><StatusPill status={expired ? 'expired' : invite.status} /></td><td>{new Date(invite.expires_at).toLocaleString()}</td><td>{canInvite.data && invite.status === 'pending' && !expired && <button className="text-action danger-action" onClick={() => void revoke(invite.id, invite.invited_email)}><XCircle size={13} />Revoke</button>}</td></tr>
        })}
      </tbody></table></div> : <EmptyNotice title="No invitations on this page" detail="Move to another page to see more invitations." /> : <EmptyNotice title="No invitations yet" detail="New invitation records will appear here." />}
    {invitations.data && invitations.data.total > INVITATION_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Invitation pages">
      <button className="button outline" disabled={page === 0 || invitations.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
      <span className="field-hint">Page {page + 1} of {Math.ceil(invitations.data.total / INVITATION_PAGE_SIZE)}</span>
      <button className="button outline" disabled={(page + 1) * INVITATION_PAGE_SIZE >= invitations.data.total || invitations.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button>
    </nav>}
  </section>
}

