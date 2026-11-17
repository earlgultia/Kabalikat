import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
  const checkInInFlight = useRef(false)
  const [signaturePath, setSignaturePath] = useState('')
  const drawing = useRef(false)
  function signaturePoint(event: ReactPointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(400, ((event.clientX - bounds.left) / bounds.width) * 400))
    const y = Math.max(0, Math.min(140, ((event.clientY - bounds.top) / bounds.height) * 140))
    return `${x.toFixed(1)} ${y.toFixed(1)}`
  }

  function startSignature(event: ReactPointerEvent<SVGSVGElement>) {
    drawing.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setSignaturePath((current) => `${current}${current ? ' ' : ''}M${signaturePoint(event)}`)
  }
  function continueSignature(event: ReactPointerEvent<SVGSVGElement>) {
    if (drawing.current) setSignaturePath((current) => current.length < 19500 ? `${current} L${signaturePoint(event)}` : current)
  }

  async function checkIn() {
    if (checkInInFlight.current) return
    checkInInFlight.current = true
    setError(''); setBusy(true)
    try {
      await checkInWithMeetingQr(meetingId, token, signaturePath)
      setComplete(true)
      await queryClient.invalidateQueries({ queryKey: ['attendance', meetingId] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Check-in could not be completed.') }
    finally { checkInInFlight.current = false; setBusy(false) }
  }

  const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  return <main className="auth-page attendance-qr-page">
    <div className="auth-brand"><div className="brand-mark"><HeartHandshake size={24} /></div><span>KABALIKAT</span></div>
    <section className="auth-card attendance-qr-card">
      <div className="attendance-qr-icon">{complete ? <CheckCircle2 size={27} /> : <QrCode size={27} />}</div>
      <div className="eyebrow">MEETING ATTENDANCE</div>
      <h1>{complete ? "You're checked in" : 'Check in to this meeting'}</h1>
      <p className="muted">{complete ? 'Your attendance has been recorded for this meeting.' : 'Sign in with your invited KABALIKAT account to confirm your attendance.'}</p>
      {!validCode && <div className="error-banner" role="alert">This QR code is invalid or incomplete. Ask an official for a current code.</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {!loading && !user && validCode && <Link className="button primary full attendance-sign-in" to={`/sign-in?next=${encodeURIComponent(returnPath)}`}>Sign in to continue</Link>}
      {loading && <p className="muted">Checking your sign-in...</p>}
      {!loading && user && validCode && !complete && <>
        <label className="attendance-signature-label">Sign below using your finger or stylus</label>
        <svg className="attendance-signature-pad" viewBox="0 0 400 140" role="img" aria-label="Signature drawing area" onPointerDown={startSignature} onPointerMove={continueSignature} onPointerUp={() => { drawing.current = false }} onPointerCancel={() => { drawing.current = false }}>
          <rect x="0" y="0" width="400" height="140" rx="12" fill="#fff" />
          <path d={signaturePath} fill="none" stroke="#155b56" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 118 H384" stroke="#b8c8c2" strokeWidth="1" />
        </svg>
        <button type="button" className="button outline full attendance-sign-in" disabled={busy || !signaturePath} onClick={() => setSignaturePath('')}>Clear signature</button>
        <button className="button primary full attendance-sign-in" disabled={busy || !signaturePath.includes(' L')} onClick={() => void checkIn()}>{busy ? 'Checking you in...' : 'Sign and confirm attendance'}</button>
      </>}
      {complete && <Link className="button outline full attendance-sign-in" to="/">Return to KABALIKAT</Link>}
      <div className="auth-foot"><ShieldCheck size={15} />The code expires quickly and can only be used once per eligible attendee.</div>
    </section>
    <p className="auth-caption">One Barangay. One Connected Community.</p>
  </main>
}
