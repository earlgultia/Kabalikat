import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { CheckCircle2, KeyRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { ErrorNotice } from './shared'

const credentialsSchema = z.object({ email: z.email(), password: z.string().min(8).max(128) })

export function AcceptInvitationPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [mode, setMode] = useState<'sign-in' | 'create-account'>('create-account')
  const [accountMessage, setAccountMessage] = useState('')

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setAccountMessage('')
    if (!supabase || token.length !== 64) { setError('This invitation link is invalid. Request a fresh link from your barangay administrator.'); return }
    const form = event.currentTarget
    const parsed = credentialsSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Enter a valid email and password.'); return }
    setBusy(true)
    try {
      if (mode === 'sign-in') {
        const { error: authError } = await supabase.auth.signInWithPassword(parsed.data)
        if (authError) throw authError
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          ...parsed.data,
          options: { emailRedirectTo: window.location.href },
        })
        if (authError) throw authError
        if (!data.session) setAccountMessage('Check your email to confirm your account. This invitation link will be waiting when you return.')
      }
    } catch {
      setError('We could not authenticate that account. Check your details or try the other option.')
    } finally { setBusy(false) }
  }

  async function accept() {
    if (!supabase || token.length !== 64) { setError('This invitation link is invalid. Request a fresh link from your barangay administrator.'); return }
    setBusy(true); setError('')
    try {
      const { error: rpcError } = await supabase.rpc('accept_membership_invitation', { p_token: token })
      if (rpcError) throw rpcError
      setAccepted(true)
      window.setTimeout(() => { window.location.assign('/') }, 800)
    } catch (err) { setError(err instanceof Error ? err.message : 'The invitation could not be accepted.') }
    finally { setBusy(false) }
  }

  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><div className="brand-mark"><KeyRound size={22} /></div><span>KABALIKAT</span></div>
    <div className="eyebrow">BARANGAY MEMBERSHIP</div>
    <h1>{accepted ? 'Invitation accepted' : user ? 'Accept your invitation' : mode === 'create-account' ? 'Create your account' : 'Sign in to continue'}</h1>
    <p className="muted">{user ? <>Signed in as <strong>{user.email}</strong>. Membership is granted only when the invitation email matches.</> : 'Use the email address that received this invitation. Your account gets no barangay access unless the invitation is valid.'}</p>
    {error && <ErrorNotice message={error} />}
    {accountMessage && <div className="notice"><CheckCircle2 size={17} />{accountMessage}</div>}
    {accepted ? <div className="ops-success"><CheckCircle2 size={16} />Your membership is active. Opening your workspace...</div> : user ? <>
      <button className="button primary full" onClick={() => void accept()} disabled={busy || token.length !== 64}>{busy ? 'Checking invitation...' : 'Accept invitation'}</button>
      {user.email_confirmed_at == null && <p className="field-hint" style={{ marginTop: 12 }}>Confirm your email before accepting this invitation.</p>}
      <button className="button outline full" style={{ marginTop: 10 }} onClick={() => void supabase?.auth.signOut()}>Use a different account</button>
      <p className="field-hint" style={{ marginTop: 16 }}>The invitation can only be accepted by its addressed email.</p>
    </> : <>
      <form className="form-stack" onSubmit={(event) => void authenticate(event)}>
        <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} /></label>
        <button className="button primary full" disabled={busy || token.length !== 64}>{busy ? 'Please wait...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
      </form>
      <button className="button outline full" style={{ marginTop: 10 }} onClick={() => { setMode(mode === 'sign-in' ? 'create-account' : 'sign-in'); setError(''); setAccountMessage('') }}>
        {mode === 'sign-in' ? 'Create an account' : 'I already have an account'}
      </button>
    </>}
  </section></main>
}
