import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Bell, KeyRound, ShieldCheck, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { listCommunityNotificationPreferences, saveCommunityNotificationPreference } from './notifications-data'

const passwordSchema = z.object({
  password: z.string().min(12, 'Use at least 12 characters.').max(128)
    .regex(/[a-z]/, 'Add a lowercase letter.').regex(/[A-Z]/, 'Add an uppercase letter.')
    .regex(/[0-9]/, 'Add a number.'),
  confirmation: z.string(),
}).refine((value) => value.password === value.confirmation, { path: ['confirmation'], message: 'The passwords do not match.' })

export function AccountSecurityDialog({ email, userId, tenantId, onClose }: { email: string; userId: string; tenantId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [error, setError] = useState('')
  const [preferenceError, setPreferenceError] = useState('')
  const [message, setMessage] = useState('')
  const preferences = useQuery({
    queryKey: ['notification-preferences', tenantId, userId],
    queryFn: () => listCommunityNotificationPreferences(tenantId!, userId),
    enabled: Boolean(tenantId),
  })

  async function setNotificationPreference(resourceType: 'announcement' | 'disaster_advisory', enabled: boolean) {
    if (!tenantId) return
    setPreferenceBusy(true); setPreferenceError('')
    try {
      await saveCommunityNotificationPreference({ tenantId, userId, resourceType, enabled })
      await queryClient.invalidateQueries({ queryKey: ['notification-preferences', tenantId, userId] })
    } catch { setPreferenceError('Unable to save this preference. Please try again.') }
    finally { setPreferenceBusy(false) }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = passwordSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the password requirements.'); return }
    if (!supabase) { setError('Account security is unavailable because Supabase is not configured.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password })
      if (updateError) throw updateError
      form.reset(); setMessage('Your password has been updated.')
    } catch {
      setError('We could not update your password. Check the requirements and try again.')
    } finally { setBusy(false) }
  }

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])')
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  return <div className="tool-finder-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="account-security-dialog" role="dialog" aria-modal="true" aria-labelledby="account-security-title" onKeyDown={(event) => { trapFocus(event); if (event.key === 'Escape' && !busy) onClose() }}>
      <header><span className="account-security-icon"><KeyRound size={20} /></span><div><h2 id="account-security-title">Account security</h2><p>Change the password for {email}</p></div><button type="button" className="icon-button" aria-label="Close account security" onClick={onClose} disabled={busy}><X size={18} /></button></header>
      <section className="notification-preferences" aria-labelledby="notification-preferences-title">
        <div className="notification-preferences-heading"><Bell size={17} /><div><h3 id="notification-preferences-title">In-app notifications</h3><p>Choose which new updates appear in your inbox for this barangay.</p></div></div>
        {!tenantId && <p className="field-hint">Join an active barangay workspace to manage notification preferences.</p>}
        {tenantId && preferences.isPending && <p className="field-hint" role="status">Loading preferences…</p>}
        {tenantId && preferences.error && <p className="account-security-error" role="alert">Notification preferences could not be loaded.</p>}
        {tenantId && preferences.data && <div className="notification-preference-list">
          {([
            ['announcement', 'Community announcements', 'New announcements visible to your role.'],
            ['disaster_advisory', 'Disaster advisories', 'New published advisories visible to your role.'],
          ] as const).map(([resourceType,label,detail]) => {
            const enabled = preferences.data?.find((item) => item.resource_type === resourceType)?.enabled ?? true
            return <label className="notification-preference" key={resourceType}><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={enabled} disabled={preferenceBusy || preferences.isFetching} onChange={(event) => void setNotificationPreference(resourceType,event.target.checked)} /></label>
          })}
        </div>}
        {preferenceError && <p className="account-security-error" role="alert">{preferenceError}</p>}
        <p className="field-hint">These settings apply only to announcements and disaster advisories. Profile correction, document status, and feedback response alerts stay enabled so you can track your requests. No email or SMS is sent.</p>
      </section>
      <form className="account-security-form" onSubmit={(event) => void changePassword(event)}>
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required autoFocus /><span className="field-hint">At least 12 characters, with uppercase, lowercase, and a number.</span></label>
        <label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        {error && <p className="account-security-error" role="alert">{error}</p>}{message && <p className="account-security-success" role="status"><ShieldCheck size={16} />{message}</p>}
        <div className="account-security-actions"><button type="button" className="button outline" onClick={onClose} disabled={busy}>Close</button><button type="submit" className="button primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></div>
      </form>
      <p className="account-security-note"><ShieldCheck size={14} />Passwords are managed by Supabase Auth and are never stored in barangay records.</p>
    </section>
  </div>
}
