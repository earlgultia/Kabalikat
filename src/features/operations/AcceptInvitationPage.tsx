import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { LogoutConfirmationDialog } from '../../components/LogoutConfirmationDialog'
import { ErrorNotice } from './shared'

const signInSchema = z.object({ email: z.email(), password: z.string().min(8).max(128) })
const createAccountSchema = z.object({ email: z.email(), display_name: z.string().trim().min(2, 'Enter the name colleagues should use.').max(100, 'Keep your name under 100 characters.'), password: z.string().min(12, 'Use at least 12 characters.').max(128)
  .regex(/[a-z]/, 'Add a lowercase letter.').regex(/[A-Z]/, 'Add an uppercase letter.')
  .regex(/[0-9]/, 'Add a number.'), confirmation: z.string() })
  .refine((value) => value.password === value.confirmation, { path: ['confirmation'], message: 'The passwords do not match.' })

export function AcceptInvitationPage() {
  const { user, signOut } = useAuth()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [invitationKind, setInvitationKind] = useState<'barangay' | 'lgu' | ''>('')
  const [invitationTarget, setInvitationTarget] = useState('')
  const [invitationCheck, setInvitationCheck] = useState<'checking' | 'ready' | 'failed' | 'invalid'>('checking')
  const [checkAttempt, setCheckAttempt] = useState(0)
  const [mode, setMode] = useState<'sign-in' | 'create-account'>('create-account')
  const [accountMessage, setAccountMessage] = useState('')
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  useEffect(() => {
    setInvitationKind('')
    setInvitationTarget('')
    if (token.length !== 64) { setInvitationCheck('invalid'); return }
    if (!supabase) { setInvitationCheck('failed'); return }
    let active = true
    setInvitationCheck('checking')
    void (async () => {
      try {
        const { data, error: lookupError } = await supabase.rpc('get_public_invitation_kind', { p_token: token })
        if (!active) return
        if (lookupError) { setInvitationCheck('failed'); return }
        const result = (data ?? [])[0] as { invitation_kind?: string; target_label?: string } | undefined
        if (result?.invitation_kind !== 'barangay' && result?.invitation_kind !== 'lgu') {
          setInvitationCheck('invalid')
          return
        }
        setInvitationKind(result.invitation_kind)
        setInvitationTarget(result?.target_label ?? '')
        setInvitationCheck('ready')
      } catch {
        if (active) setInvitationCheck('failed')
      }
    })()
    return () => { active = false }
  }, [token, checkAttempt])

  async function handleDifferentAccount() {
    setLogoutConfirmOpen(false)
    try { await signOut() }
    catch { setError('The current session could not be cleared. Refresh this invitation page and try again.') }
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setAccountMessage(''); setConfirmationEmail('')
    if (!supabase || token.length !== 64) { setError('This invitation link is invalid. Request a fresh link from your barangay administrator.'); return }
    if (!invitationKind) { setError('This invitation could not be verified. Refresh the page or request a new invitation link.'); return }
    const form = event.currentTarget
    const formValues = Object.fromEntries(new FormData(form).entries())
    const parsed = mode === 'sign-in' ? signInSchema.safeParse(formValues) : createAccountSchema.safeParse(formValues)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Enter a valid email and password.'); return }
    const displayName = String(formValues.display_name ?? '').trim()
    setBusy(true)
    try {
      if (mode === 'sign-in') {
        const { error: authError } = await supabase.auth.signInWithPassword(parsed.data)
        if (authError) throw authError
        await acceptInvitation()
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: window.location.href, data: { display_name: displayName } },
        })
        if (authError) throw authError
        if (!data.session) {
          setConfirmationEmail(parsed.data.email)
          setAccountMessage('If you receive a confirmation email, confirm your account first and return to this link. If you are already signed in, tap Accept invitation; otherwise sign in here and the invitation will be accepted automatically.')
        } else await acceptInvitation()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not complete sign-in or invitation acceptance. Check your details or try the other option.')
    } finally { setBusy(false) }
  }

  async function acceptInvitation() {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { error: rpcError } = invitationKind === 'lgu'
      ? await supabase.rpc('accept_lgu_administrator_invitation', { p_token: token })
      : await supabase.rpc('accept_membership_invitation', { p_token: token })
    if (rpcError) throw rpcError
    setAccepted(true)
    window.setTimeout(() => { window.location.assign('/') }, 800)
  }

  async function resendConfirmation() {
    if (!supabase || !confirmationEmail) return
    setBusy(true); setError(''); setAccountMessage('')
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: confirmationEmail,
        options: { emailRedirectTo: window.location.href },
      })
      if (resendError) throw resendError
      setAccountMessage('If a confirmation email is needed for this account, a new message has been sent. Follow its link, return here, and sign in; the invitation will then be accepted automatically.')
    } catch {
      setError('We could not resend the confirmation email. Try signing in or request help from your barangay administrator.')
    } finally { setBusy(false) }
  }

  async function accept() {
    if (!supabase || token.length !== 64) { setError('This invitation link is invalid. Request a fresh link from your barangay administrator.'); return }
    if (!invitationKind) { setError('This invitation could not be verified. Refresh the page or request a new invitation link.'); return }
    setBusy(true); setError('')
    try {
      await acceptInvitation()
    } catch (err) { setError(err instanceof Error ? err.message : 'The invitation could not be accepted.') }
    finally { setBusy(false) }
  }

  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><div className="brand-mark"><KeyRound size={22} /></div><span>KABALIKAT</span></div>
    <div className="eyebrow">{invitationKind === 'lgu' ? 'MUNICIPAL LGU ADMINISTRATOR' : 'BARANGAY MEMBERSHIP'}</div>
    <h1>{accepted ? 'Invitation accepted' : user ? 'Accept your invitation' : mode === 'create-account' ? 'Create your account' : 'Sign in to continue'}</h1>
    <p className="muted">{invitationTarget && <>Invitation for <strong>{invitationTarget}</strong>. </>}{user ? <>Signed in as <strong>{user.email}</strong>. Access is granted only when the invitation email matches.</> : `Use the email address that received this invitation. ${invitationKind === 'lgu' ? 'LGU administrator access' : 'Barangay access'} is granted only after the invitation is accepted.`}</p>
    {invitationCheck === 'checking' && <div className="notice" role="status">Checking this invitation link…</div>}
    {invitationCheck === 'failed' && <div className="notice" role="alert">We could not check this invitation. Check your connection, then try again. <button type="button" className="text-action" onClick={() => { setError(''); setCheckAttempt((attempt) => attempt + 1) }}>Retry</button></div>}
    {invitationCheck === 'invalid' && <div className="notice" role="alert">This invitation link is invalid or no longer available. Ask the person who invited you to send a new link.</div>}
    {error && <ErrorNotice message={error} />}
    {accountMessage && <div className="notice"><CheckCircle2 size={17} />{accountMessage}</div>}
    {confirmationEmail && !user && !accepted && <button type="button" className="button outline full" style={{ marginTop: 10 }} onClick={() => void resendConfirmation()} disabled={busy}>{busy ? 'Sending...' : 'Resend confirmation email'}</button>}
    {invitationCheck === 'ready' && !user && !accepted && <div className="notice"><CheckCircle2 size={17} />Sign in or create an account with the invited email. Once authentication succeeds, this link accepts the invitation and activates your {invitationKind === 'lgu' ? 'municipal LGU' : 'barangay'} access. If email confirmation is required, return to this link and sign in after confirming.</div>}
    {accepted ? <div className="ops-success"><CheckCircle2 size={16} />Your {invitationKind === 'lgu' ? 'LGU administrator access' : 'barangay membership'} is active. Opening your workspace...</div> : user ? <>
      <button className="button primary full" onClick={() => void accept()} disabled={busy || invitationCheck !== 'ready' || !invitationKind}>{busy ? 'Checking invitation...' : 'Accept invitation'}</button>
      {user.email_confirmed_at == null && <p className="field-hint" style={{ marginTop: 12 }}>Confirm your email before accepting this invitation.</p>}
      <button className="button outline full" style={{ marginTop: 10 }} onClick={() => setLogoutConfirmOpen(true)}>Use a different account</button>
      <p className="field-hint" style={{ marginTop: 16 }}>The invitation can only be accepted by its addressed email.</p>
    </> : <>
      <form className="form-stack" onSubmit={(event) => void authenticate(event)}>
        {mode === 'create-account' && <label>Display name<input name="display_name" type="text" required minLength={2} maxLength={100} autoComplete="name" placeholder="How colleagues should address you" /></label>}
        <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<div className="auth-password-field"><input name="password" type={showPassword ? 'text' : 'password'} required minLength={mode === 'create-account' ? 12 : 8} maxLength={128} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} /><button type="button" className="auth-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        {mode === 'create-account' && <><span className="field-hint">New passwords need at least 12 characters, including uppercase, lowercase, and a number.</span><label>Confirm password<div className="auth-password-field"><input name="confirmation" type={showConfirmation ? 'text' : 'password'} required minLength={12} maxLength={128} autoComplete="new-password" /><button type="button" className="auth-password-toggle" onClick={() => setShowConfirmation((visible) => !visible)} aria-label={showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'} aria-pressed={showConfirmation}>{showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label></>}
        <button className="button primary full" disabled={busy || invitationCheck !== 'ready' || !invitationKind}>{busy ? 'Please wait...' : mode === 'sign-in' ? 'Sign in and accept invitation' : invitationKind === 'lgu' ? 'Create account and join LGU' : 'Create account and join barangay'}</button>
      </form>
      <button className="button outline full" style={{ marginTop: 10 }} onClick={() => { setMode(mode === 'sign-in' ? 'create-account' : 'sign-in'); setError(''); setAccountMessage(''); setConfirmationEmail('') }}>
        {mode === 'sign-in' ? 'New to KABALIKAT? Create an account' : 'Already have an account? Sign in'}
      </button>
    </>}
  </section>{logoutConfirmOpen && <LogoutConfirmationDialog onCancel={() => setLogoutConfirmOpen(false)} onConfirm={() => void handleDifferentAccount()} />}</main>
}
