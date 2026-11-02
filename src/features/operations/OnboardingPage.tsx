import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Building2, ClipboardCheck } from 'lucide-react'
import { onboardBarangay } from './data'
import { createExistingBarangayCaptainInvitation } from './platform-data'
import { ErrorNotice, PageHeading } from './shared'

const onboardingSchema = z.object({
  name: z.string().trim().min(2).max(120),
  municipality: z.string().trim().min(2).max(120),
  province: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40),
  captainEmail: z.email(),
})
const existingCaptainSchema = z.object({ barangayCode: z.string().trim().min(2).max(40), captainEmail: z.email() })

export function OnboardingPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [existingCaptainInviteUrl, setExistingCaptainInviteUrl] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setInviteUrl('')
    const form = event.currentTarget
    const parsed = onboardingSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the barangay details.'); return }
    setBusy(true)
    try {
      const result = await onboardBarangay(parsed.data)
      const url = new URL('/accept-invitation', window.location.origin)
      url.searchParams.set('token', result.invitation_token)
      setInviteUrl(url.toString())
      setMessage('Barangay created with default document types. Its first captain can accept the invite using the email address entered.')
      form.reset()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create the barangay.') }
    finally { setBusy(false) }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(inviteUrl); setMessage('Captain invitation link copied. Send it through an approved channel.') }
    catch { setError('Clipboard access is unavailable. Select and copy the link below.') }
  }

  async function inviteCaptainToExistingBarangay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setExistingCaptainInviteUrl('')
    const form = event.currentTarget
    const parsed = existingCaptainSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the barangay code and Captain email.'); return }
    setBusy(true)
    try {
      const result = await createExistingBarangayCaptainInvitation(parsed.data.barangayCode, parsed.data.captainEmail)
      const url = new URL('/accept-invitation', window.location.origin)
      url.searchParams.set('token', result.invitation_token)
      setExistingCaptainInviteUrl(url.toString())
      setMessage('Captain invitation created. Send this link to the existing Captain account. The signed-in email must match the invitation email.')
      form.reset()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create the Captain invitation.') }
    finally { setBusy(false) }
  }

  async function copyExistingCaptainInvite() {
    try { await navigator.clipboard.writeText(existingCaptainInviteUrl); setMessage('Captain invitation link copied. Send it through your approved channel.') }
    catch { setError('Clipboard access is unavailable. Select and copy the link below.') }
  }

  return <section className="operation-page">
    <PageHeading title="Barangay onboarding" description="Create a tenant and generate a seven-day, email-bound first-captain invitation." />
    {message && <div className="ops-success"><ClipboardCheck size={16} />{message}</div>}
    {error && <ErrorNotice message={error} />}
    <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>New barangay</h2><p>Barangay codes must be unique across the platform.</p></div><Building2 size={18} /></div>
      <div className="ops-form-grid"><label>Barangay name<input name="name" required maxLength={120} /></label><label>Barangay code<input name="code" required maxLength={40} /></label>
        <label>Municipality / city<input name="municipality" required maxLength={120} /></label><label>Province<input name="province" required maxLength={120} /></label>
        <label className="span-two">First Captain email<input type="email" name="captainEmail" required autoComplete="email" /></label></div>
      <div className="ops-form-actions"><span className="field-hint">No email is sent. Deliver the generated invitation through your approved channel.</span><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create barangay'}</button></div>
      {inviteUrl && <div className="invite-link-box"><label>Captain invitation link<input readOnly value={inviteUrl} /></label><button type="button" className="button outline" onClick={() => void copy()}><ClipboardCheck size={15} />Copy link</button></div>}
    </form>
    <section className="ops-panel ops-form existing-captain-invitation" aria-labelledby="existing-captain-invitation-title">
      <div className="ops-panel-heading"><div><h2 id="existing-captain-invitation-title">Invite a Captain to an existing barangay</h2><p>Use this if the workspace and plan already exist but the Captain account has no active membership.</p></div><Building2 size={18} /></div>
      <form className="ops-form-grid" onSubmit={(event) => void inviteCaptainToExistingBarangay(event)}>
        <label>Existing barangay code<input name="barangayCode" required maxLength={40} autoComplete="off" /></label>
        <label>Captain account email<input type="email" name="captainEmail" required autoComplete="email" /></label>
        <div className="span-two ops-form-actions"><span className="field-hint">The Captain must open the link and accept it while signed in with this same email.</span><button className="button primary" disabled={busy}>{busy ? 'Creating invite…' : 'Create Captain invitation'}</button></div>
      </form>
      {existingCaptainInviteUrl && <div className="invite-link-box"><label>Existing barangay Captain invitation<input readOnly value={existingCaptainInviteUrl} /></label><button type="button" className="button outline" onClick={() => void copyExistingCaptainInvite()}><ClipboardCheck size={15} />Copy link</button></div>}
    </section>
  </section>
}

