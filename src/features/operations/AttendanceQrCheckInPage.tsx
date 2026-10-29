import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, HeartHandshake, QrCode, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { checkInWithMeetingQr } from './data'

export function AttendanceQrCheckInPage() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const meetingId = params.get('meeting') ?? ''
  const token = window.location.hash.slice(1)
  const validCode = /^[0-9a-f]{64}$/i.test(token) && /^[0-9a-f-]{36}$/i.test(meetingId)
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  async function checkIn() {
    setError(''); setBusy(true)
    try {
      await checkInWithMeetingQr(meetingId, token)
      setComplete(true)
      await queryClient.invalidateQueries({ queryKey: ['attendance', meetingId] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Check-in could not be completed.') }
    finally { setBusy(false) }
  }

  const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  return <main className="auth-page attendance-qr-page">
    <div className="auth-brand"><div className="brand-mark"><HeartHandshake size={24} /></div><span>KABALIKAT</span></div>
    <section className="auth-card attendance-qr-card">
      <div className="attendance-qr-icon">{complete ? <CheckCircle2 size={27} /> : <QrCode size={27} />}</div>
      <div className="eyebrow">MEETING ATTENDANCE</div>
      <h1>{complete ? 'You’re checked in' : 'Check in to this meeting'}</h1>
      <p className="muted">{complete ? 'Your attendance has been recorded for this meeting.' : 'Sign in with your invited KABALIKAT account to confirm your attendance.'}</p>
      {!validCode && <div className="error-banner" role="alert">This QR code is invalid or incomplete. Ask an official for a current code.</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {!loading && !user && validCode && <Link className="button primary full attendance-sign-in" to={`/sign-in?next=${encodeURIComponent(returnPath)}`}>Sign in to continue</Link>}
      {loading && <p className="muted">Checking your sign-in…</p>}
      {!loading && user && validCode && !complete && <button className="button primary full attendance-sign-in" disabled={busy} onClick={() => void checkIn()}>{busy ? 'Checking you in…' : 'Confirm attendance'}</button>}
      {complete && <Link className="button outline full attendance-sign-in" to="/">Return to KABALIKAT</Link>}
      <div className="auth-foot"><ShieldCheck size={15} />The code expires quickly and can only be used once per eligible attendee.</div>
    </section>
    <p className="auth-caption">One Barangay. One Connected Community.</p>
  </main>
}
