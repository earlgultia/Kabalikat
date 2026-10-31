import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Download, Pencil, Search, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import {
  createMeeting, hasPermission, listAttendance, listMeetingAttendeeMembers, listMeetingAttendees, listMeetingMemberPage, listMeetingPage, updateMeetingDetails,
  markAttendance, recordAttendance, updateMeetingStatus, MEETING_MEMBER_PAGE_SIZE, MEETING_PAGE_SIZE,
} from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'
import { MeetingRecordsPanel } from './MeetingRecordsPanel'
import { MeetingQrPanel } from './MeetingQrPanel'
import { MeetingReasonDialog } from './MeetingReasonDialog'

type MeetingReasonRequest = {
  title: string; description: string; label: string; confirmLabel: string
  onConfirm: (reason: string) => Promise<void>
}

const meetingSchema = z.object({
  title: z.string().trim().min(2).max(180),
  location: z.string().trim().min(2).max(180),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
  agenda: z.string().max(5000).optional(),
})

export function MeetingsPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [meetingSearchInput, setMeetingSearchInput] = useState('')
  const [meetingSearch, setMeetingSearch] = useState('')
  const [meetingStatus, setMeetingStatus] = useState<'all' | 'draft' | 'scheduled' | 'completed' | 'cancelled'>('all')
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([])
  const [memberPage, setMemberPage] = useState(0)
  const [memberSearch, setMemberSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState('')
  const [attendanceSearch, setAttendanceSearch] = useState('')
  const [editingMeeting, setEditingMeeting] = useState('')
  const [reasonRequest, setReasonRequest] = useState<MeetingReasonRequest | null>(null)
  const [reasonBusy, setReasonBusy] = useState(false)
  useEffect(() => {
    setPage(0)
    setMeetingSearchInput('')
    setMeetingSearch('')
    setMeetingStatus('all')
    setSelectedMeeting('')
    setEditingMeeting('')
    setSelectedAttendees([])
    setOpen(false)
    setMemberPage(0)
    setMemberSearch('')
  }, [tenantId])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setMeetingSearch(meetingSearchInput.trim()); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [meetingSearchInput])
  const meetings = useQuery({ queryKey: ['meetings', tenantId, page, meetingSearch, meetingStatus], queryFn: () => listMeetingPage(tenantId, page, meetingSearch, meetingStatus), enabled: Boolean(tenantId) })
  useEffect(() => {
    if (!meetings.isPending && !meetings.isError && page > 0 && meetings.data?.meetings.length === 0) setPage((current) => Math.max(0, current - 1))
  }, [meetings.data?.meetings.length, meetings.isError, meetings.isPending, page])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'meeting.manage'], queryFn: () => hasPermission(tenantId, 'meeting.manage'), enabled: Boolean(tenantId) })
  const canManageAttendance = useQuery({ queryKey: ['permission', tenantId, 'attendance.manage'], queryFn: () => hasPermission(tenantId, 'attendance.manage'), enabled: Boolean(tenantId) })
  const canSelectAttendees = useQuery({ queryKey: ['permission', tenantId, 'membership.read'], queryFn: () => hasPermission(tenantId, 'membership.read'), enabled: Boolean(tenantId) })
  const members = useQuery({ queryKey: ['meeting-attendee-members', selectedMeeting], queryFn: () => listMeetingAttendeeMembers(selectedMeeting), enabled: Boolean(selectedMeeting && canManage.data) })
  const memberDirectory = useQuery({
    queryKey: ['meeting-member-directory', tenantId, memberPage, memberSearch],
    queryFn: () => listMeetingMemberPage(tenantId, memberPage, memberSearch),
    enabled: Boolean(tenantId && canSelectAttendees.data && open),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const attendance = useQuery({
    queryKey: ['attendance', selectedMeeting], queryFn: () => listAttendance(selectedMeeting), enabled: Boolean(selectedMeeting),
  })
  const attendees = useQuery({
    queryKey: ['meeting-attendees', selectedMeeting], queryFn: () => listMeetingAttendees(selectedMeeting),
    enabled: Boolean(selectedMeeting && canManage.data),
  })
  const attendanceSearchTerm = attendanceSearch.trim().toLocaleLowerCase()
  const visibleAttendance = (attendance.data ?? []).filter((item) => {
    if (!attendanceSearchTerm) return true
    const member = members.data?.find((entry) => entry.user_id === item.user_id)
    return [item.user_id === user?.id ? 'you' : '', member?.profile?.display_name ?? '', member?.role?.label ?? '', item.status, item.source]
      .some((value) => value.toLocaleLowerCase().includes(attendanceSearchTerm))
  })
  const visibleAttendees = (attendees.data ?? []).filter(({ user_id: attendeeId }) => {
    if (!attendanceSearchTerm) return true
    const member = members.data?.find((entry) => entry.user_id === attendeeId)
    return [member?.profile?.display_name ?? '', member?.role?.label ?? '']
      .some((value) => value.toLocaleLowerCase().includes(attendanceSearchTerm))
  })
  const attendanceSummary = (attendance.data ?? []).reduce((summary, row) => {
    if (row.status === 'present' || row.status === 'absent' || row.status === 'excused') summary[row.status] += 1
    return summary
  }, { present: 0, absent: 0, excused: 0 })
  const recordedAttendeeCount = new Set((attendance.data ?? []).map((row) => row.user_id)).size
  const unrecordedAttendeeCount = Math.max(0, (attendees.data?.length ?? 0) - recordedAttendeeCount)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    const form = event.currentTarget
    const parsed = meetingSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the meeting details.'); return }
    const startsAt = new Date(parsed.data.startsAt)
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
    if (Number.isNaN(startsAt.getTime()) || endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) {
      setError('Check the meeting date and time.'); return
    }
    setBusy(true)
    try {
      const id = await createMeeting({
        tenantId, title: parsed.data.title, location: parsed.data.location,
        startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? '',
        agenda: parsed.data.agenda ?? '', attendeeIds: selectedAttendees,
      })
      await queryClient.invalidateQueries({ queryKey: ['meetings', tenantId] })
      setPage(0)
      setSelectedMeeting(id); setMessage('Meeting created. You are added as an eligible attendee.')
      setSelectedAttendees([]); setOpen(false); form.reset()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create this meeting.') }
    finally { setBusy(false) }
  }

  function toggleMeetingForm() {
    if (!open) {
      setSelectedMeeting('')
      setMemberPage(0)
      setMemberSearch('')
    }
    setOpen((value) => !value)
  }

  async function checkIn(id: string) {
    try {
      await markAttendance(id)
      await queryClient.invalidateQueries({ queryKey: ['attendance', id] })
      setMessage('Your attendance has been recorded.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Attendance could not be recorded.') }
  }

  async function setAttendance(id: string, attendeeId: string, status: 'present' | 'absent' | 'excused') {
    const previous = attendance.data?.find((item) => item.user_id === attendeeId)
    if (previous?.status === status) return
    const needsReason = status !== 'present' || Boolean(previous)
    const save = async (reason: string) => {
      await recordAttendance(id, attendeeId, status, reason)
      await queryClient.invalidateQueries({ queryKey: ['attendance', id] })
      setMessage('Attendance record saved and added to its audit history.')
      setError('')
    }
    if (needsReason) {
      setReasonRequest({
        title: previous ? 'Correct attendance record' : `Mark attendee ${status}`,
        description: 'A brief reason is saved with this attendance change for accountability.',
        label: 'Reason for this change', confirmLabel: 'Save attendance', onConfirm: save,
      })
      return
    }
    try { await save('') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to record attendance.') }
  }

  async function setStatus(id: string, status: 'completed' | 'cancelled') {
    const save = async (reason: string) => {
      await updateMeetingStatus(id, status, reason)
      await queryClient.invalidateQueries({ queryKey: ['meetings', tenantId] })
      await queryClient.invalidateQueries({ queryKey: ['meeting-status-history', tenantId, id] })
      setMessage(status === 'cancelled' ? 'Meeting cancelled and reason recorded.' : 'Meeting marked complete.')
      setError('')
    }
    if (status === 'cancelled') {
      setReasonRequest({
        title: 'Cancel this meeting?', description: 'Tell attendees why the meeting is being cancelled. This reason is saved in its status history.',
        label: 'Cancellation reason', confirmLabel: 'Cancel meeting', onConfirm: save,
      })
      return
    }
    try { await save('') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the meeting.') }
  }

  async function confirmReason(reason: string) {
    if (!reasonRequest) return
    setReasonBusy(true)
    try { await reasonRequest.onConfirm(reason); setReasonRequest(null) }
    finally { setReasonBusy(false) }
  }

  async function saveMeetingEdit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); setError(''); setMessage('')
    const form = event.currentTarget
    const parsed = meetingSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the meeting details.'); return }
    const startsAt = new Date(parsed.data.startsAt)
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
    if (Number.isNaN(startsAt.getTime()) || endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) {
      setError('Check the meeting date and time.'); return
    }
    setBusy(true)
    try {
      await updateMeetingDetails(id, {
        title: parsed.data.title, location: parsed.data.location,
        startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null, agenda: parsed.data.agenda ?? '',
      })
      await queryClient.invalidateQueries({ queryKey: ['meetings', tenantId] })
      setEditingMeeting(''); setMessage('Meeting details updated.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the meeting.') }
    finally { setBusy(false) }
  }

  function toLocalDateTimeInput(value: string) {
    const date = new Date(value)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  }

  function exportAttendanceCSV(meetingTitle: string) {
    const recordsByUser = new Map((attendance.data ?? []).map((entry) => [entry.user_id, entry]))
    const memberByUser = new Map((members.data ?? []).map((entry) => [entry.user_id, entry]))
    const escapeCell = (value: string) => {
      const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value
      return `"${safeValue.replaceAll('"', '""')}"`
    }
    const rows = [
      ['Attendee', 'Role', 'Status', 'Source', 'Recorded at'],
      ...(attendees.data ?? []).map(({ user_id: attendeeId }) => {
        const member = memberByUser.get(attendeeId)
        const record = recordsByUser.get(attendeeId)
        return [member?.profile?.display_name || (attendeeId === user?.id ? 'You' : 'Member'), member?.role?.label ?? '', record?.status ?? 'not recorded', record?.source?.replaceAll('_', ' ') ?? '', record?.recorded_at ?? '']
      }),
    ]
    const content = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${meetingTitle.trim().replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meeting'}-attendance.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }

  return <section className="operation-page">
    <PageHeading title="Meetings & attendance" description="Schedule meetings, share agendas with eligible members, and record attendance.">
      {canManage.data && <button className="button primary" onClick={toggleMeetingForm}><CalendarDays size={16} />Schedule meeting</button>}
    </PageHeading>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view meetings and attendance." />}
    {Boolean(tenantId) && (canManage.isPending || canManageAttendance.isPending || canSelectAttendees.isPending) && <LoadingNotice compact />}
    {(canManage.error || canManageAttendance.error || canSelectAttendees.error) && <ErrorNotice message="Some meeting permissions could not be checked. Related scheduling, attendance, or invite controls may be unavailable until access can be verified." />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {open && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>Meeting details</h2><p>Invited members are validated as active members of this barangay.</p></div><CalendarDays size={18} /></div>
      <div className="ops-form-grid"><label>Meeting title<input name="title" required maxLength={180} /></label><label>Location<input name="location" required maxLength={180} /></label>
        <label>Starts<input name="startsAt" type="datetime-local" required /></label><label>Ends <span className="field-hint">Optional</span><input name="endsAt" type="datetime-local" /></label>
        <label className="span-two">Agenda<textarea name="agenda" rows={3} maxLength={5000} /></label></div>
      {canSelectAttendees.data && <div className="attendee-picker"><strong>Invite active members <span className="field-hint">Optional · {selectedAttendees.length}/100 selected · selections stay checked as you browse</span></strong>
        <label className="archive-search meeting-member-search"><Search size={16} /><input type="search" aria-label="Search active members" placeholder="Search by name or role" value={memberSearch} onChange={(event) => { setMemberSearch(event.target.value); setMemberPage(0) }} /></label>
        {memberDirectory.isPending ? <LoadingNotice compact /> : memberDirectory.error ? <ErrorNotice message="Active members could not be loaded." onRetry={() => void memberDirectory.refetch()} retrying={memberDirectory.isFetching} /> : <>
          <div className="attendee-list">{memberDirectory.data?.members.filter((member) => member.user_id !== user?.id).map((member) => <label key={member.user_id}><input type="checkbox" checked={selectedAttendees.includes(member.user_id)} disabled={!selectedAttendees.includes(member.user_id) && selectedAttendees.length >= 100} onChange={(event) => setSelectedAttendees((current) => event.target.checked ? [...current, member.user_id] : current.filter((id) => id !== member.user_id))} /><span>{member.display_name || 'Member'} · {member.role_label}</span></label>)}</div>
          {memberDirectory.data && memberDirectory.data.total > MEETING_MEMBER_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Active member pages"><button type="button" className="button outline" disabled={memberPage === 0 || memberDirectory.isFetching} onClick={() => setMemberPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} />Previous</button><span className="field-hint">Page {memberPage + 1} of {Math.ceil(memberDirectory.data.total / MEETING_MEMBER_PAGE_SIZE)} · {memberDirectory.data.total.toLocaleString()} members</span><button type="button" className="button outline" disabled={(memberPage + 1) * MEETING_MEMBER_PAGE_SIZE >= memberDirectory.data.total || memberDirectory.isFetching} onClick={() => setMemberPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></nav>}
        </>}
      </div>}
      <div className="ops-form-actions"><span className="field-hint">Attendance self-check-in opens 30 minutes before start and closes 30 minutes after end.</span><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Create meeting'}</button></div>
    </form>}
    <div className="ops-section-title"><h2>Scheduled meetings</h2><p>Meeting lists and attendance are tenant- and role-scoped.</p></div>
    {tenantId && <div className="incident-filters"><label className="archive-search"><Search size={16} /><input type="search" aria-label="Search meetings" maxLength={100} placeholder="Search title, location, or agenda" value={meetingSearchInput} onChange={(event) => setMeetingSearchInput(event.target.value)} /></label><label>Meeting status<select value={meetingStatus} onChange={(event) => { setMeetingStatus(event.target.value as typeof meetingStatus); setPage(0) }}><option value="all">All statuses</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div>}
    {!tenantId ? null : meetings.isPending ? <LoadingNotice /> : meetings.error ? <ErrorNotice message={meetings.error.message} onRetry={() => void meetings.refetch()} retrying={meetings.isFetching} /> : meetings.data?.total ? meetings.data.meetings.length ?
      <div className="ops-meeting-list">{meetings.data.meetings.map((meeting) => <article className="ops-panel meeting-card" key={meeting.id}>
        <div className="meeting-card-top"><div className="request-icon"><CalendarDays size={18} /></div><div className="meeting-title"><h2>{meeting.title}</h2><p>{meeting.location} · {formatDateTime(meeting.starts_at)}</p></div><StatusPill status={meeting.status} /></div>
        {meeting.agenda && <div className="meeting-agenda"><strong><ClipboardList size={14} />Agenda</strong><p>{meeting.agenda}</p></div>}
        <div className="meeting-actions"><button className="button outline" onClick={() => { setAttendanceSearch(''); setSelectedMeeting((current) => current === meeting.id ? '' : meeting.id) }}>{selectedMeeting === meeting.id ? 'Hide meeting details' : 'View attendance & records'}</button>
          {meeting.status === 'scheduled' && <button className="button primary" onClick={() => void checkIn(meeting.id)}>I’m attending</button>}
          {canManage.data && (meeting.status === 'scheduled' || meeting.status === 'draft') && <button className="button outline" onClick={() => setEditingMeeting((current) => current === meeting.id ? '' : meeting.id)}>{editingMeeting === meeting.id ? <><X size={15} />Close editor</> : <><Pencil size={15} />Edit meeting</>}</button>}
          {canManage.data && meeting.status === 'scheduled' && <><button className="text-action" onClick={() => void setStatus(meeting.id, 'completed')}>Complete</button><button className="text-action danger-action" onClick={() => void setStatus(meeting.id, 'cancelled')}>Cancel</button></>}
        </div>
        {editingMeeting === meeting.id && <form className="meeting-edit-form ops-form" onSubmit={(event) => void saveMeetingEdit(event, meeting.id)}>
          <h3>Edit meeting details</h3>
          <div className="ops-form-grid"><label>Meeting title<input name="title" required minLength={2} maxLength={180} defaultValue={meeting.title} /></label><label>Location<input name="location" required minLength={2} maxLength={180} defaultValue={meeting.location} /></label>
            <label>Starts<input name="startsAt" type="datetime-local" required defaultValue={toLocalDateTimeInput(meeting.starts_at)} /></label><label>Ends <span className="field-hint">Optional</span><input name="endsAt" type="datetime-local" defaultValue={meeting.ends_at ? toLocalDateTimeInput(meeting.ends_at) : ''} /></label>
            <label className="span-two">Agenda<textarea name="agenda" rows={3} maxLength={5000} defaultValue={meeting.agenda} /></label></div>
          <div className="ops-form-actions"><span className="field-hint">Edits update the schedule, location, and agenda. Status and invitees stay unchanged.</span><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
        </form>}
        {selectedMeeting === meeting.id && <div className="attendance-panel">
          {canManage.data && attendees.data && attendance.data && <div className="meeting-attendance-summary" aria-label="Attendance summary">
            <span><strong>{attendanceSummary.present}</strong> Present</span><span><strong>{attendanceSummary.absent}</strong> Absent</span><span><strong>{attendanceSummary.excused}</strong> Excused</span><span><strong>{unrecordedAttendeeCount}</strong> Not recorded</span>
            <button type="button" className="button outline" onClick={() => exportAttendanceCSV(meeting.title)}><Download size={15} />Export attendance CSV</button>
          </div>}
          <label className="archive-search attendance-search"><Search size={16} /><input type="search" aria-label="Search meeting attendees" maxLength={100} placeholder="Search attendees by name, role, or status" value={attendanceSearch} onChange={(event) => setAttendanceSearch(event.target.value)} /></label>
          {(attendance.data?.length || attendees.data?.length) ? <p className="field-hint attendance-search-count" aria-live="polite">Attendance records: {visibleAttendance.length} of {attendance.data?.length ?? 0}. Eligible roster: {visibleAttendees.length} of {attendees.data?.length ?? 0}.</p> : null}
          {attendance.isPending ? <LoadingNotice compact /> : attendance.error ? <ErrorNotice message={attendance.error.message} /> : attendance.data?.length ? visibleAttendance.length ? <ul>{visibleAttendance.map((item) => <li key={item.user_id}><span>{item.user_id === user?.id ? 'You' : members.data?.find((m) => m.user_id === item.user_id)?.profile?.display_name || 'Attendee'} <small>{item.source.replace('_', ' ')}</small></span><StatusPill status={item.status} /></li>)}</ul> : <p>No attendance record matches your search.</p> : <p>No attendance has been recorded yet.</p>}
          {canManage.data && <div className="attendance-roster">
            <strong>Eligible attendees <span className="field-hint">Official entries and corrections are audited.</span></strong>
            {attendees.isPending ? <LoadingNotice compact /> : attendees.error ? <ErrorNotice message={attendees.error.message} /> : attendees.data?.length ? visibleAttendees.length ? visibleAttendees.map(({ user_id: attendeeId }) => {
              const member = members.data?.find((item) => item.user_id === attendeeId)
              const entry = attendance.data?.find((item) => item.user_id === attendeeId)
              return <div className="attendance-roster-row" key={attendeeId}>
                <span>{member?.profile?.display_name || (attendeeId === user?.id ? 'You' : 'Member')}<small>{member?.role?.label ?? ''}</small></span>
                <div>{(['present', 'absent', 'excused'] as const).map((status) => <button key={status} className={entry?.status === status ? 'selected' : ''} onClick={() => void setAttendance(meeting.id, attendeeId, status)}>{status}</button>)}</div>
              </div>
            }) : <p>No eligible attendee matches your search.</p> : <p>No eligible attendees have been assigned.</p>}
          </div>}
          <MeetingQrPanel meetingId={meeting.id} scheduled={meeting.status === 'scheduled'} canManage={Boolean(canManageAttendance.data)} />
          <MeetingRecordsPanel tenantId={tenantId} meetingId={meeting.id} meetingTitle={meeting.title} location={meeting.location}
            startsAt={meeting.starts_at} agenda={meeting.agenda} attendance={attendance.data ?? []} members={members.data ?? []}
            attendanceLoading={attendance.isPending || Boolean(attendance.error)} currentUserId={user?.id}
            canManage={Boolean(canManage.data)} />
        </div>}
      </article>)}</div> : <EmptyNotice title="No meetings on this page" detail="Move to another page to see more meetings." /> : <EmptyNotice title={meetingSearch || meetingStatus !== 'all' ? 'No matching meetings' : 'No meetings scheduled'} detail={meetingSearch || meetingStatus !== 'all' ? 'Try another search or choose a different status.' : 'Meetings created for this barangay will appear here.'} />}
    {meetings.data && meetings.data.total > MEETING_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Meeting pages">
      <button className="button outline" disabled={page === 0 || meetings.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
      <span className="field-hint">Page {page + 1} of {Math.ceil(meetings.data.total / MEETING_PAGE_SIZE)}</span>
      <button className="button outline" disabled={(page + 1) * MEETING_PAGE_SIZE >= meetings.data.total || meetings.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button>
    </nav>}
    {reasonRequest && <MeetingReasonDialog {...reasonRequest} busy={reasonBusy} onCancel={() => { if (!reasonBusy) setReasonRequest(null) }} onConfirm={confirmReason} />}
  </section>
}

