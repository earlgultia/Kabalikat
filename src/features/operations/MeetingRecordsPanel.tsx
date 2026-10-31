import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, FileText, History, Plus, ScrollText } from 'lucide-react'
import {
  approveMeetingResolution, createMeetingResolution, getMeetingMinutes, listAllMeetingResolutions,
  listAllMeetingStatusHistory, listMeetingResolutionPage, listMeetingStatusHistoryPage, MEETING_RESOLUTION_PAGE_SIZE,
  MEETING_STATUS_HISTORY_PAGE_SIZE, saveMeetingMinutes,
} from './data'
import { ErrorNotice, LoadingNotice, StatusPill } from './shared'
import { formatDateTime } from './format'
import type { AttendanceRow, MemberRow, MeetingResolutionRow, MeetingStatusEventRow } from './data'

export function MeetingRecordsPanel({ tenantId, meetingId, meetingTitle, location, startsAt, agenda, attendance, attendanceLoading, members, canManage, currentUserId }: {
  tenantId: string; currentUserId?: string
  meetingId: string; meetingTitle: string; location: string; startsAt: string; agenda: string
  attendance: AttendanceRow[]; attendanceLoading: boolean; members: MemberRow[]; canManage: boolean
}) {
  const queryClient = useQueryClient()
  const minutes = useQuery({ queryKey: ['meeting-minutes', meetingId], queryFn: () => getMeetingMinutes(meetingId) })
  const [resolutionPage, setResolutionPage] = useState(0)
  const resolutions = useQuery({ queryKey: ['meeting-resolutions', meetingId, resolutionPage], queryFn: () => listMeetingResolutionPage(meetingId, resolutionPage) })
  const [minutesText, setMinutesText] = useState('')
  const [resolutionTitle, setResolutionTitle] = useState('')
  const [resolutionText, setResolutionText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [printResolutions, setPrintResolutions] = useState<MeetingResolutionRow[] | null>(null)
  const [printStatusHistory, setPrintStatusHistory] = useState<MeetingStatusEventRow[] | null>(null)
  const [statusHistoryOpen, setStatusHistoryOpen] = useState(false)
  const [statusHistoryPage, setStatusHistoryPage] = useState(0)
  const statusHistory = useQuery({
    queryKey: ['meeting-status-history', tenantId, meetingId, statusHistoryPage],
    queryFn: () => listMeetingStatusHistoryPage(tenantId, meetingId, statusHistoryPage),
    enabled: Boolean(canManage && statusHistoryOpen),
  })

  useEffect(() => { setMinutesText(minutes.data?.content ?? '') }, [minutes.data?.content, minutes.data?.updated_at, minutes.data?.id])
  useEffect(() => {
    if (printResolutions === null) return
    const finishPrint = () => { setPrintResolutions(null); setPrintStatusHistory(null) }
    window.addEventListener('afterprint', finishPrint)
    const frame = window.requestAnimationFrame(() => window.print())
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('afterprint', finishPrint) }
  }, [printResolutions])

  const printableResolutions = printResolutions ?? resolutions.data?.rows ?? []

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes', meetingId] }),
      queryClient.invalidateQueries({ queryKey: ['meeting-resolutions', meetingId] }),
    ])
  }

  async function exportReport() {
    setError(''); setBusy(true)
    try {
      const [allResolutions, allStatusEvents] = await Promise.all([
        listAllMeetingResolutions(meetingId), listAllMeetingStatusHistory(tenantId, meetingId),
      ])
      setPrintStatusHistory(allStatusEvents)
      setPrintResolutions(allResolutions)
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to prepare the full meeting report.') }
    finally { setBusy(false) }
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
      setResolutionPage(0); setResolutionTitle(''); setResolutionText(''); await refresh()
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
      {canManage && <button className="button outline" disabled={busy || minutes.isPending || resolutions.isPending || attendanceLoading}
        onClick={() => void exportReport()}><FileText size={15} />{busy || minutes.isPending || resolutions.isPending || attendanceLoading ? 'Preparing report…' : 'Export report PDF'}</button>}
    </div>
    {canManage && <details className="meeting-status-history" onToggle={(event) => setStatusHistoryOpen(event.currentTarget.open)}>
      <summary><History size={15} />Status change history{statusHistory.data ? ` (${statusHistory.data.total})` : ''}</summary>
      {statusHistoryOpen && <>
        {statusHistory.isPending ? <LoadingNotice compact /> : statusHistory.error ? <ErrorNotice message="Meeting status history could not be loaded." onRetry={() => void statusHistory.refetch()} retrying={statusHistory.isFetching} /> : statusHistory.data?.rows.length ? <ol>{statusHistory.data.rows.map((entry) => <li key={entry.id}>
          <div><strong>{entry.from_status ? `${entry.from_status.replaceAll('_', ' ')} → ` : ''}{entry.to_status.replaceAll('_', ' ')}</strong><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></div>
          <small>{entry.actor_id === currentUserId ? 'Changed by you' : 'Changed by an authorized meeting manager'}{entry.reason ? ` · ${entry.reason}` : ''}</small>
        </li>)}</ol> : <p className="field-hint">No meeting status changes have been recorded.</p>}
        {statusHistory.data && statusHistory.data.total > MEETING_STATUS_HISTORY_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Meeting status history pages">
          <button type="button" className="button outline" disabled={statusHistoryPage === 0 || statusHistory.isFetching} onClick={() => setStatusHistoryPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} />Previous</button>
          <span className="field-hint">Page {statusHistoryPage + 1} of {Math.ceil(statusHistory.data.total / MEETING_STATUS_HISTORY_PAGE_SIZE)} · {statusHistory.data.total.toLocaleString()} changes</span>
          <button type="button" className="button outline" disabled={(statusHistoryPage + 1) * MEETING_STATUS_HISTORY_PAGE_SIZE >= statusHistory.data.total || statusHistory.isFetching} onClick={() => setStatusHistoryPage((current) => current + 1)}>Next<ChevronRight size={15} /></button>
        </nav>}
      </>}
    </details>}
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
        {resolutions.isPending ? <LoadingNotice compact /> : resolutions.error ? <ErrorNotice message={resolutions.error.message} /> : resolutions.data?.rows.length ? <ul className="meeting-resolution-list">{resolutions.data.rows.map((item) => <li key={item.id}>
          <div className="meeting-resolution-top"><strong>{item.resolution_number}</strong><StatusPill status={item.status} /></div><h5>{item.title}</h5><p>{item.content}</p>
          <small className="field-hint">Added {formatDateTime(item.created_at)}{item.approved_at ? ` · Approved ${formatDateTime(item.approved_at)}` : ''}</small>
          {canManage && item.status === 'draft' && <button className="text-action" disabled={busy} onClick={() => void approve(item.id)}>Approve resolution</button>}
        </li>)}</ul> : <p className="field-hint">No resolutions have been recorded.</p>}
        {resolutions.data && resolutions.data.total > MEETING_RESOLUTION_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Resolution pages"><button type="button" className="button outline" disabled={resolutionPage === 0 || resolutions.isFetching} onClick={() => setResolutionPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} />Previous</button><span className="field-hint">Page {resolutionPage + 1} of {Math.ceil(resolutions.data.total / MEETING_RESOLUTION_PAGE_SIZE)} · {resolutions.data.total.toLocaleString()} resolutions</span><button type="button" className="button outline" disabled={(resolutionPage + 1) * MEETING_RESOLUTION_PAGE_SIZE >= resolutions.data.total || resolutions.isFetching} onClick={() => setResolutionPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></nav>}
      </section>
    </div>
    <article className="meeting-print-report" id="meeting-print-root">
      <header><h1>KABALIKAT</h1><p>Meeting report</p></header>
      <h2>{meetingTitle}</h2><p>{location} · {formatDateTime(startsAt)}</p>
      {agenda && <section><h3>Agenda</h3><p>{agenda}</p></section>}
      <section><h3>Meeting minutes</h3><p>{minutes.data?.content || 'No minutes have been recorded.'}</p><small>Status: {minutes.data?.status ?? 'not added'}</small></section>
      <section><h3>Resolutions</h3>{printableResolutions.length ? printableResolutions.map((resolution) => <div className="meeting-print-resolution" key={resolution.id}>
        <strong>{resolution.resolution_number}: {resolution.title}</strong><p>{resolution.content}</p><small>Status: {resolution.status}</small>
      </div>) : <p>No resolutions have been recorded.</p>}</section>
      <section><h3>Status history</h3>{(printStatusHistory ?? []).length ? <table><thead><tr><th>Change</th><th>When</th><th>Reason</th></tr></thead><tbody>{(printStatusHistory ?? []).map((entry) => <tr key={entry.id}>
        <td>{entry.from_status ? `${entry.from_status.replaceAll('_', ' ')} → ` : ''}{entry.to_status.replaceAll('_', ' ')}</td><td>{formatDateTime(entry.created_at)}</td><td>{entry.reason || '—'}</td>
      </tr>)}</tbody></table> : <p>No status changes have been recorded.</p>}</section>
      <section><h3>Attendance</h3>{attendance.length ? <table><thead><tr><th>Attendee</th><th>Status</th><th>Recorded</th></tr></thead><tbody>{attendance.map((item) => <tr key={item.user_id}>
        <td>{members.find((member) => member.user_id === item.user_id)?.profile?.display_name || 'Attendee'}</td><td>{item.status}</td><td>{formatDateTime(item.recorded_at)}</td>
      </tr>)}</tbody></table> : <p>No attendance has been recorded.</p>}</section>
      <footer>Generated {formatDateTime(new Date().toISOString())} · Prepared from the meeting records available to this account.</footer>
    </article>
  </section>
}
