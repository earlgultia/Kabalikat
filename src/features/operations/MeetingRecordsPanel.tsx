import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileText, Plus, ScrollText } from 'lucide-react'
import {
  approveMeetingResolution, createMeetingResolution, getMeetingMinutes, listMeetingResolutions, saveMeetingMinutes,
} from './data'
import { ErrorNotice, LoadingNotice, StatusPill } from './shared'
import { formatDateTime } from './format'
import type { AttendanceRow, MemberRow } from './data'

export function MeetingRecordsPanel({ meetingId, meetingTitle, location, startsAt, agenda, attendance, attendanceLoading, members, canManage }: {
  meetingId: string; meetingTitle: string; location: string; startsAt: string; agenda: string
  attendance: AttendanceRow[]; attendanceLoading: boolean; members: MemberRow[]; canManage: boolean
}) {
  const queryClient = useQueryClient()
  const minutes = useQuery({ queryKey: ['meeting-minutes', meetingId], queryFn: () => getMeetingMinutes(meetingId) })
  const resolutions = useQuery({ queryKey: ['meeting-resolutions', meetingId], queryFn: () => listMeetingResolutions(meetingId) })
  const [minutesText, setMinutesText] = useState('')
  const [resolutionTitle, setResolutionTitle] = useState('')
  const [resolutionText, setResolutionText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { setMinutesText(minutes.data?.content ?? '') }, [minutes.data?.content, minutes.data?.updated_at, minutes.data?.id])

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes', meetingId] }),
      queryClient.invalidateQueries({ queryKey: ['meeting-resolutions', meetingId] }),
    ])
  }

  async function persistMinutes(reviewed: boolean) {
    setError(''); setMessage(''); setBusy(true)
    try {
      await saveMeetingMinutes(meetingId, minutesText, reviewed)
      await refresh()
      setMessage(reviewed ? 'Minutes saved and marked reviewed.' : 'Minutes saved as a draft.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save meeting minutes.') }
    finally { setBusy(false) }
  }

  async function submitResolution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true)
    try {
      await createMeetingResolution(meetingId, resolutionTitle, resolutionText)
      setResolutionTitle(''); setResolutionText(''); await refresh()
      setMessage('Resolution added as a draft. It needs approval before it is official.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add this resolution.') }
    finally { setBusy(false) }
  }

  async function approve(id: string) {
    if (!window.confirm('Approve this resolution? It will be marked as an official approved record.')) return
    setError(''); setMessage(''); setBusy(true)
    try { await approveMeetingResolution(id); await refresh(); setMessage('Resolution approved and recorded.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to approve this resolution.') }
    finally { setBusy(false) }
  }

  return <section className="meeting-records" aria-label="Meeting minutes and resolutions">
    <div className="meeting-records-heading"><div><h3>Minutes & resolutions</h3><p>Keep a clear record of decisions made at this meeting.</p></div>
      {canManage && <button className="button outline" disabled={minutes.isPending || resolutions.isPending || attendanceLoading}
        onClick={() => window.print()}><FileText size={15} />{minutes.isPending || resolutions.isPending || attendanceLoading ? 'Preparing report…' : 'Export report PDF'}</button>}
    </div>
    {message && <div className="ops-success"><Check size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    <div className="meeting-record-grid">
      <section className="meeting-record-card">
        <div className="meeting-record-title"><FileText size={17} /><h4>Meeting minutes</h4>{minutes.data && <StatusPill status={minutes.data.status} />}</div>
        {minutes.isPending ? <LoadingNotice compact /> : minutes.error ? <ErrorNotice message={minutes.error.message} /> : <>
          {canManage ? <><label className="meeting-record-input">Write or update the minutes<textarea rows={7} maxLength={100000} value={minutesText} onChange={(event) => setMinutesText(event.target.value)} placeholder="Summarize the discussion, decisions, and next steps." /></label>
            <div className="meeting-record-actions"><button className="button outline" disabled={busy} onClick={() => void persistMinutes(false)}>Save draft</button><button className="button primary" disabled={busy || minutesText.trim().length < 3} onClick={() => void persistMinutes(true)}>Mark reviewed</button></div></>
            : minutes.data ? <p className="meeting-record-content">{minutes.data.content}</p> : <p className="field-hint">Minutes have not been added yet.</p>}
          {minutes.data?.updated_at && <small className="field-hint">Last updated {formatDateTime(minutes.data.updated_at)}</small>}
        </>}
      </section>
      <section className="meeting-record-card">
        <div className="meeting-record-title"><ScrollText size={17} /><h4>Resolutions</h4></div>
        {canManage && <form className="meeting-resolution-form" onSubmit={(event) => void submitResolution(event)}>
          <label>Resolution title<input required minLength={3} maxLength={180} value={resolutionTitle} onChange={(event) => setResolutionTitle(event.target.value)} /></label>
          <label>Decision and details<textarea required minLength={3} maxLength={20000} rows={3} value={resolutionText} onChange={(event) => setResolutionText(event.target.value)} /></label>
          <button className="button outline" disabled={busy}><Plus size={15} />Add draft resolution</button>
        </form>}
        {resolutions.isPending ? <LoadingNotice compact /> : resolutions.error ? <ErrorNotice message={resolutions.error.message} /> : resolutions.data?.length ? <ul className="meeting-resolution-list">{resolutions.data.map((item) => <li key={item.id}>
          <div className="meeting-resolution-top"><strong>{item.resolution_number}</strong><StatusPill status={item.status} /></div><h5>{item.title}</h5><p>{item.content}</p>
          <small className="field-hint">Added {formatDateTime(item.created_at)}{item.approved_at ? ` · Approved ${formatDateTime(item.approved_at)}` : ''}</small>
          {canManage && item.status === 'draft' && <button className="text-action" disabled={busy} onClick={() => void approve(item.id)}>Approve resolution</button>}
        </li>)}</ul> : <p className="field-hint">No resolutions have been recorded.</p>}
      </section>
    </div>
    <article className="meeting-print-report" id="meeting-print-root">
      <header><h1>KABALIKAT</h1><p>Meeting report</p></header>
      <h2>{meetingTitle}</h2><p>{location} · {formatDateTime(startsAt)}</p>
      {agenda && <section><h3>Agenda</h3><p>{agenda}</p></section>}
      <section><h3>Meeting minutes</h3><p>{minutes.data?.content || 'No minutes have been recorded.'}</p><small>Status: {minutes.data?.status ?? 'not added'}</small></section>
      <section><h3>Resolutions</h3>{resolutions.data?.length ? resolutions.data.map((resolution) => <div className="meeting-print-resolution" key={resolution.id}>
        <strong>{resolution.resolution_number}: {resolution.title}</strong><p>{resolution.content}</p><small>Status: {resolution.status}</small>
      </div>) : <p>No resolutions have been recorded.</p>}</section>
      <section><h3>Attendance</h3>{attendance.length ? <table><thead><tr><th>Attendee</th><th>Status</th><th>Recorded</th></tr></thead><tbody>{attendance.map((item) => <tr key={item.user_id}>
        <td>{members.find((member) => member.user_id === item.user_id)?.profile?.display_name || 'Attendee'}</td><td>{item.status}</td><td>{formatDateTime(item.recorded_at)}</td>
      </tr>)}</tbody></table> : <p>No attendance has been recorded.</p>}</section>
      <footer>Generated {formatDateTime(new Date().toISOString())} · Prepared from the meeting records available to this account.</footer>
    </article>
  </section>
}
