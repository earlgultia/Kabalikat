import { useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, RefreshCw } from 'lucide-react'
import { createMeetingAttendanceToken } from './data'
import { formatDateTime } from './format'
import { ErrorNotice } from './shared'

export function MeetingQrPanel({ meetingId, scheduled, canManage }: { meetingId: string; scheduled: boolean; canManage: boolean }) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function issueToken() {
    setBusy(true); setError('')
    try {
      const result = await createMeetingAttendanceToken(meetingId)
      const url = new URL('/attendance/check-in', window.location.origin)
      url.searchParams.set('meeting', meetingId)
      url.hash = result.token
      const dataUrl = await QRCode.toDataURL(url.toString(), {
        width: 240, margin: 2, errorCorrectionLevel: 'M',
        color: { dark: '#155b56', light: '#ffffff' },
      })
      setQrDataUrl(dataUrl); setExpiresAt(result.expires_at)
    } catch (err) {
      setQrDataUrl(''); setExpiresAt('')
      setError(err instanceof Error ? err.message : 'Unable to create a QR attendance code.')
    } finally { setBusy(false) }
  }

  if (!canManage || !scheduled) return null
  return <section className="meeting-qr-panel" aria-label="QR attendance">
    <div><h4><QrCode size={17} /> QR attendance</h4><p>Generate a code for eligible attendees. It expires after five minutes and can be refreshed.</p></div>
    {error && <ErrorNotice message={error} />}
    {qrDataUrl ? <div className="meeting-qr-active"><img src={qrDataUrl} alt="Temporary QR code for meeting attendance" />
      <div><strong>Code expires</strong><span>{formatDateTime(expiresAt)}</span><small>Attendees must sign in to their KABALIKAT account. Each eligible person can check in once.</small>
        <button className="button outline" disabled={busy} onClick={() => void issueToken()}><RefreshCw size={15} />{busy ? 'Refreshing…' : 'Refresh code'}</button></div>
    </div> : <button className="button outline" disabled={busy} onClick={() => void issueToken()}><QrCode size={15} />{busy ? 'Creating code…' : 'Create QR code'}</button>}
  </section>
}
