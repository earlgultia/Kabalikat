import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, HeartHandshake, KeyRound, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'

const resetSchema = z.object({
  password: z.string().min(12, 'Use at least 12 characters.').max(128)
    .regex(/[a-z]/, 'Add a lowercase letter.').regex(/[A-Z]/, 'Add an uppercase letter.')
    .regex(/[0-9]/, 'Add a number.'),
  confirmation: z.string(),
}).refine((value) => value.password === value.confirmation, { path: ['confirmation'], message: 'The passwords do not match.' })

export function PasswordRecoveryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  if (!user) return <main className="auth-page"><div className="auth-brand"><div className="brand-mark"><HeartHandshake size={24} /></div><span>KABALIKAT</span></div><section className="auth-card"><div className="eyebrow">ACCOUNT RECOVERY</div><h1>Open your recovery email</h1><p className="muted">Use the password recovery link sent to your email. If the link expired, request another one from the sign-in page.</p><Link className="auth-back-link" to="/sign-in"><ArrowLeft size={16} /> Back to sign in</Link></section><p className="auth-caption">One Barangay. One Connected Community.</p></main>

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = resetSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the password requirements.'); return }
    if (!supabase) { setError('Password reset is unavailable because Supabase is not configured.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password })
      if (updateError) throw updateError
      setMessage('Your password has been reset. Taking you to your workspace…')
      window.setTimeout(() => navigate('/', { replace: true }), 1200)
    } catch {
      setError('This recovery link may have expired. Request a new one and try again.')
    } finally { setBusy(false) }
  }

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), a[href]')
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  return <main className="auth-page"><div className="auth-brand"><div className="brand-mark"><HeartHandshake size={24} /></div><span>KABALIKAT</span></div>
    <section className="auth-card recovery-card"><div className="recovery-icon"><KeyRound size={21} /></div><div className="eyebrow">ACCOUNT RECOVERY</div><h1>Choose a new password</h1><p className="muted">For {user.email}. Use a password you do not use on other sites.</p>
      {error && <div className="error-banner" role="alert">{error}</div>}{message && <div className="notice recovery-success" role="status"><ShieldCheck size={17} />{message}</div>}
      <form className="form-stack" onSubmit={(event) => void submit(event)} onKeyDown={trapFocus}>
        <label>New password<input autoFocus name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><span className="field-hint">At least 12 characters, with uppercase, lowercase, and a number.</span></label>
        <label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        <button className="button primary full" disabled={busy}>{busy ? 'Updating…' : 'Reset password'}<ArrowRight size={17} /></button>
      </form>
      <Link className="auth-back-link" to="/sign-in"><ArrowLeft size={16} /> Back to sign in</Link>
    </section><p className="auth-caption">One Barangay. One Connected Community.</p>
  </main>
}
