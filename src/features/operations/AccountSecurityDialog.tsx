import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Bell, Eye, EyeOff, KeyRound, ShieldCheck, UserRound, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useModalFocus } from '../../lib/useModalFocus'
import { listCommunityNotificationPreferences, saveCommunityNotificationPreference } from './notifications-data'
import { ErrorNotice } from './shared'

const passwordSchema = z.object({
  password: z.string().min(12, 'Use at least 12 characters.').max(128)
    .regex(/[a-z]/, 'Add a lowercase letter.').regex(/[A-Z]/, 'Add an uppercase letter.')
    .regex(/[0-9]/, 'Add a number.'),
  confirmation: z.string(),
}).refine((value) => value.password === value.confirmation, { path: ['confirmation'], message: 'The passwords do not match.' })
const displayNameSchema = z.string().trim().min(2, 'Use at least 2 characters.').max(100, 'Keep your name under 100 characters.')

export function AccountSecurityDialog({ email, userId, tenantId, onClose }: { email: string; userId: string; tenantId: string | null; onClose: () => void }) {
  const { dialogRef, handleDialogKeyDown } = useModalFocus<HTMLElement>()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [error, setError] = useState('')
  const [preferenceError, setPreferenceError] = useState('')
  const [message, setMessage] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const preferences = useQuery({
    queryKey: ['notification-preferences', tenantId, userId],
    queryFn: () => listCommunityNotificationPreferences(tenantId!, userId),
    enabled: Boolean(tenantId),
  })
  const profile = useQuery({
    queryKey: ['account-profile', userId],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { data, error: profileError } = await supabase.from('profiles').select('display_name').eq('id', userId).single()
      if (profileError) throw profileError
      return data.display_name
    },
    enabled: Boolean(userId),
  })
  useEffect(() => { if (profile.data !== undefined) setDisplayName(profile.data ?? '') }, [profile.data])

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = displayNameSchema.safeParse(displayName)
    if (!parsed.success) { setProfileError(parsed.error.issues[0]?.message ?? 'Enter a valid display name.'); return }
    if (!supabase) { setProfileError('Profile settings are unavailable because Supabase is not configured.'); return }
    setProfileBusy(true); setProfileError(''); setProfileMessage('')
    try {
      const { error: updateError } = await supabase.from('profiles').update({ display_name: parsed.data }).eq('id', userId)
      if (updateError) throw updateError
      setDisplayName(parsed.data)
      await queryClient.invalidateQueries()
      setProfileMessage('Your display name has been updated.')
    } catch {
      setProfileError('Unable to update your display name. Please try again.')
    } finally { setProfileBusy(false) }
  }

  async function setNotificationPreference(resourceType: 'announcement' | 'disaster_advisory' | 'meeting_update' | 'health_outreach_update' | 'sk_event_update', enabled: boolean) {
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

  return <div className="tool-finder-backdrop account-security-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialogRef} className="account-security-dialog" role="dialog" aria-modal="true" aria-labelledby="account-security-title" tabIndex={-1} onKeyDown={(event) => { handleDialogKeyDown(event); if (event.key === 'Escape' && !busy) onClose() }}>
      <header><span className="account-security-icon"><KeyRound size={20} /></span><div><h2 id="account-security-title">Account security</h2><p>Change the password for {email}</p></div><button type="button" className="icon-button" aria-label="Close account security" onClick={onClose} disabled={busy}><X size={18} /></button></header>
      <section className="notification-preferences" aria-labelledby="account-profile-title">
        <div className="notification-preferences-heading"><UserRound size={17} /><div><h3 id="account-profile-title">Profile name</h3><p>This name is shown to colleagues in your workspace.</p></div></div>
        <form className="account-profile-form" onSubmit={(event) => void saveDisplayName(event)}>
          <label htmlFor="account-display-name">Display name</label>
          <input id="account-display-name" name="display_name" value={displayName} maxLength={100} minLength={2} placeholder="How colleagues should address you" required disabled={profile.isPending || profile.isError || profileBusy} onChange={(event) => { setDisplayName(event.target.value); setProfileError(''); setProfileMessage('') }} />
          <p className="field-hint">This does not change your official resident record.</p>
          {profile.isPending && <p className="field-hint" role="status">Loading profile…</p>}
          {profile.isError && <ErrorNotice message="Your profile name could not be loaded." onRetry={() => void profile.refetch()} retrying={profile.isFetching} />}
          {profileError && <p className="account-security-error" role="alert">{profileError}</p>}
          {profileMessage && <p className="account-security-success" role="status"><ShieldCheck size={16} />{profileMessage}</p>}
          <div className="account-security-actions"><button type="submit" className="button primary" disabled={profileBusy || profile.isPending || profile.isError}>{profileBusy ? 'Saving…' : 'Save display name'}</button></div>
        </form>
      </section>
      <section className="notification-preferences" aria-labelledby="notification-preferences-title">
        <div className="notification-preferences-heading"><Bell size={17} /><div><h3 id="notification-preferences-title">In-app notifications</h3><p>Choose which new updates appear in your inbox for this barangay.</p></div></div>
        {!tenantId && <p className="field-hint">Join an active barangay workspace to manage notification preferences.</p>}
        {tenantId && preferences.isPending && <p className="field-hint" role="status">Loading preferences…</p>}
        {tenantId && preferences.error && <ErrorNotice message="Notification preferences could not be loaded." onRetry={() => void preferences.refetch()} retrying={preferences.isFetching} />}
        {tenantId && preferences.data && <div className="notification-preference-list">
          {([
            ['announcement', 'Community announcements', 'New announcements visible to your role.'],
            ['disaster_advisory', 'Disaster advisories', 'New published advisories visible to your role.'],
            ['meeting_update', 'Meeting updates', 'Schedule changes and resolution decisions for meetings you manage or are invited to.'],
            ['health_outreach_update', 'Health outreach schedule updates', 'Publication, completion, and cancellation alerts for outreach events, including aggregate attendance when completed.'],
            ['sk_event_update', 'SK event schedule updates', 'Publication, rescheduling, and cancellation notices for community events.'],
          ] as const).map(([resourceType,label,detail]) => {
            const enabled = preferences.data?.find((item) => item.resource_type === resourceType)?.enabled ?? true
            return <label className="notification-preference" key={resourceType}><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={enabled} disabled={preferenceBusy || preferences.isFetching} onChange={(event) => void setNotificationPreference(resourceType,event.target.checked)} /></label>
          })}
        </div>}
        {preferenceError && <p className="account-security-error" role="alert">{preferenceError}</p>}
        <p className="field-hint">These settings apply to announcements, advisories, meeting changes and resolution decisions, health outreach, and SK event publication or schedule changes. Profile correction, document status, and private review feedback alerts stay enabled so you can track requests. No email or SMS is sent.</p>
      </section>
      <form className="account-security-form" onSubmit={(event) => void changePassword(event)}>
        <label>New password<div className="auth-password-field"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required /><button type="button" className="auth-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide new password' : 'Show new password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><span className="field-hint">At least 12 characters, with uppercase, lowercase, and a number.</span></label>
        <label>Confirm new password<div className="auth-password-field"><input name="confirmation" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required /><button type="button" className="auth-password-toggle" onClick={() => setShowConfirmation((visible) => !visible)} aria-label={showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'} aria-pressed={showConfirmation}>{showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        {error && <p className="account-security-error" role="alert">{error}</p>}{message && <p className="account-security-success" role="status"><ShieldCheck size={16} />{message}</p>}
        <div className="account-security-actions"><button type="button" className="button outline" onClick={onClose} disabled={busy}>Close</button><button type="submit" className="button primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></div>
      </form>
      <p className="account-security-note"><ShieldCheck size={14} />Passwords are managed by Supabase Auth and are never stored in barangay records.</p>
    </section>
  </div>
}
