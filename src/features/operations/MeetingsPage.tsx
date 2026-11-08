import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarDays, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Download, History, Pencil, Search, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import {
  createMeeting, decideMeetingAttendanceCorrection, getKagawadInvitedMeetingAgenda, getMeetingInvitationResponseSummary, hasPermission, listAllMeetingSchedule, listAttendance, listKagawadAttendanceCorrectionRequests, listKagawadInvitedMeetings, listKagawadMeetingAttendanceHistory, listKagawadMeetingInvitationResponseHistory, listMeetingAttendanceCorrectionQueue, listMeetingAttendeeMembers, listMeetingAttendees, listMeetingInvitationResponseRoster, listMeetingMemberPage, listMeetingPage, requestKagawadAttendanceCorrection, setKagawadMeetingInvitationResponse, updateMeetingDetails,
  markAttendance, recordAttendance, updateMeetingStatus, MEETING_MEMBER_PAGE_SIZE, MEETING_PAGE_SIZE,
  type KagawadInvitedMeeting,
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

function MeetingInvitationResponseRoster({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [response, setResponse] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const roster = useQuery({
    queryKey: ['meeting-invitation-response-roster', meetingId, page, response, search],
    queryFn: () => listMeetingInvitationResponseRoster(meetingId, page, response, search),
    enabled: open,
  })
  const total = roster.data?.[0]?.total_count ?? 0
  const pages = Math.max(1, Math.ceil(total / 20))
  const currentPage = Math.min(page, pages - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])

  return <details className="meeting-rsvp-roster" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Review individual RSVP responses</summary>
    {open && <>
      <form className="incident-filters meeting-rsvp-roster-filters" onSubmit={(event) => { event.preventDefault(); setPage(0); setSearch(searchInput.trim()) }}>
        <label className="archive-search"><Search size={16} /><input type="search" aria-label="Search RSVP roster" maxLength={100} placeholder="Search invitees by name or role" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
        <label>Response<select value={response} onChange={(event) => { setResponse(event.target.value); setPage(0) }}><option value="all">All invitees</option><option value="attending">Plan to attend</option><option value="unavailable">Unavailable</option><option value="no_response">No response</option></select></label>
      </form>
      {roster.isPending ? <LoadingNotice compact /> : roster.error ? <ErrorNotice message="Individual RSVP responses could not be loaded." onRetry={() => void roster.refetch()} retrying={roster.isFetching} /> : roster.data?.length ? <>
        <ul className="kagawad-invited-meeting-list">{roster.data.map((member) => <li key={member.user_id}>
          <div><strong>{member.display_name}</strong><small>{member.role_label}{member.responded_at ? ` · Responded ${formatDateTime(member.responded_at)}` : ''}</small></div>
          <span className={`meeting-rsvp-response ${member.response ?? 'no-response'}`}>{member.response === 'attending' ? 'Plans to attend' : member.response === 'unavailable' ? 'Unavailable' : 'No response'}</span>
        </li>)}</ul>
        {total > 20 && <nav className="committee-picker-pagination" aria-label="RSVP roster pages"><span>Page {currentPage + 1} of {pages} · {total} invitees</span><div><button type="button" className="button outline" disabled={currentPage === 0 || roster.isFetching} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="button outline" disabled={currentPage + 1 >= pages || roster.isFetching} onClick={() => setPage(currentPage + 1)}>Next</button></div></nav>}
      </> : <p className="field-hint">No active invitees match this filter.</p>}
    </>}
  </details>
}

function KagawadMeetingAgenda({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false)
  const agenda = useQuery({
    queryKey: ['kagawad-invited-meeting-agenda', meetingId],
    queryFn: () => getKagawadInvitedMeetingAgenda(meetingId),
    enabled: open,
  })

  return <details className="kagawad-meeting-agenda" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>View meeting agenda</summary>
    {open && (agenda.isPending ? <LoadingNotice compact /> : agenda.error
      ? <ErrorNotice message="The meeting agenda could not be loaded." onRetry={() => void agenda.refetch()} retrying={agenda.isFetching} />
      : <p>{agenda.data?.trim() || 'No agenda has been added for this meeting.'}</p>)}
  </details>
}

export function MeetingsPage({ focusId, focusPage, focusCorrectionRequestId, focusCorrectionPage, focusCorrectionQueue, onFocusHandled }: { focusId?: string; focusPage?: number; focusCorrectionRequestId?: string; focusCorrectionPage?: number; focusCorrectionQueue?: boolean; onFocusHandled?: () => void }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const isKagawad = membership?.role?.key === 'kagawad'
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [invitedMeetingPage, setInvitedMeetingPage] = useState(0)
  const [invitedMeetingDraft, setInvitedMeetingDraft] = useState({ search: '', response: 'all', meetingDateAfter: '', meetingDateBefore: '' })
  const [invitedMeetingFilters, setInvitedMeetingFilters] = useState({ search: '', response: 'all', meetingDateAfter: '', meetingDateBefore: '' })
  const [meetingHistoryPage, setMeetingHistoryPage] = useState(0)
  const [meetingHistoryDraft, setMeetingHistoryDraft] = useState({ search: '', attendanceStatus: 'all', meetingDateAfter: '', meetingDateBefore: '' })
  const [meetingHistoryFilters, setMeetingHistoryFilters] = useState({ search: '', attendanceStatus: 'all', meetingDateAfter: '', meetingDateBefore: '' })
  const [rsvpHistoryPage, setRsvpHistoryPage] = useState(0)
  const [rsvpHistoryDraft, setRsvpHistoryDraft] = useState({ search: '', response: 'all', meetingDateAfter: '', meetingDateBefore: '' })
  const [rsvpHistoryFilters, setRsvpHistoryFilters] = useState({ search: '', response: 'all', meetingDateAfter: '', meetingDateBefore: '' })
  const [correctionRequestPage, setCorrectionRequestPage] = useState(0)
  const [correctionRequestDraft, setCorrectionRequestDraft] = useState({ search: '', status: 'all', requestedAttendance: 'all', submittedAfter: '', submittedBefore: '' })
  const [correctionRequestFilters, setCorrectionRequestFilters] = useState({ search: '', status: 'all', requestedAttendance: 'all', submittedAfter: '', submittedBefore: '' })
  const [correctionQueuePage, setCorrectionQueuePage] = useState(0)
  const [correctionMeetingId, setCorrectionMeetingId] = useState('')
  const [correctionStatus, setCorrectionStatus] = useState<'present' | 'absent' | 'excused'>('present')
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionReviewNotes, setCorrectionReviewNotes] = useState<Record<string, string>>({})
  const [meetingSearchInput, setMeetingSearchInput] = useState('')
  const [meetingSearch, setMeetingSearch] = useState('')
  const [meetingStatus, setMeetingStatus] = useState<'all' | 'draft' | 'scheduled' | 'completed' | 'cancelled'>('all')
  const [startsOnOrAfter, setStartsOnOrAfter] = useState('')
  const [startsOnOrBefore, setStartsOnOrBefore] = useState('')
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([])
  const [memberPage, setMemberPage] = useState(0)
  const [memberSearch, setMemberSearch] = useState('')
  const skipNextMeetingSearchReset = useRef(false)
  const [open, setOpen] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState('')
  const [attendanceSearch, setAttendanceSearch] = useState('')
  const [editingMeeting, setEditingMeeting] = useState('')
  const [reasonRequest, setReasonRequest] = useState<MeetingReasonRequest | null>(null)
  const [reasonBusy, setReasonBusy] = useState(false)
  const [scheduleExportBusy, setScheduleExportBusy] = useState(false)
  const [scheduleExportError, setScheduleExportError] = useState('')
  useEffect(() => {
    setPage(0)
    setInvitedMeetingPage(0)
    setInvitedMeetingDraft({ search: '', response: 'all', meetingDateAfter: '', meetingDateBefore: '' })
    setInvitedMeetingFilters({ search: '', response: 'all', meetingDateAfter: '', meetingDateBefore: '' })
    setMeetingHistoryPage(0)
    setMeetingHistoryDraft({ search: '', attendanceStatus: 'all', meetingDateAfter: '', meetingDateBefore: '' })
    setMeetingHistoryFilters({ search: '', attendanceStatus: 'all', meetingDateAfter: '', meetingDateBefore: '' })
    setRsvpHistoryPage(0)
    setRsvpHistoryDraft({ search: '', response: 'all', meetingDateAfter: '', meetingDateBefore: '' })
    setRsvpHistoryFilters({ search: '', response: 'all', meetingDateAfter: '', meetingDateBefore: '' })
    setCorrectionRequestPage(0)
    setCorrectionRequestDraft({ search: '', status: 'all', requestedAttendance: 'all', submittedAfter: '', submittedBefore: '' })
    setCorrectionRequestFilters({ search: '', status: 'all', requestedAttendance: 'all', submittedAfter: '', submittedBefore: '' })
    setCorrectionQueuePage(0)
    setCorrectionMeetingId('')
    setMeetingSearchInput('')
    setMeetingSearch('')
    setMeetingStatus('all')
    setStartsOnOrAfter('')
    setStartsOnOrBefore('')
    setSelectedMeeting('')
    setEditingMeeting('')
    setSelectedAttendees([])
    setOpen(false)
    setMemberPage(0)
    setMemberSearch('')
  }, [tenantId])
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setMeetingSearch(meetingSearchInput.trim())
      if (skipNextMeetingSearchReset.current) skipNextMeetingSearchReset.current = false
      else setPage(0)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [meetingSearchInput])
  const dateRangeInvalid = Boolean(startsOnOrAfter && startsOnOrBefore && startsOnOrBefore < startsOnOrAfter)
  const localDateBoundary = (value: string, dayOffset = 0) => {
    if (!value) return null
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day + dayOffset)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const startsAfter = localDateBoundary(startsOnOrAfter)
  const startsBefore = localDateBoundary(startsOnOrBefore, 1)
  const meetings = useQuery({ queryKey: ['meetings', tenantId, page, meetingSearch, meetingStatus, startsOnOrAfter, startsOnOrBefore], queryFn: () => listMeetingPage(tenantId, page, meetingSearch, meetingStatus, startsAfter, startsBefore), enabled: Boolean(tenantId && !dateRangeInvalid) })
  const invitedMeetings = useQuery({ queryKey: ['kagawad-invited-meetings', tenantId, invitedMeetingPage, invitedMeetingFilters], queryFn: () => listKagawadInvitedMeetings(tenantId, invitedMeetingPage, invitedMeetingFilters), enabled: Boolean(tenantId && isKagawad) })
  const meetingHistory = useQuery({ queryKey: ['kagawad-meeting-attendance-history', tenantId, meetingHistoryPage, meetingHistoryFilters], queryFn: () => listKagawadMeetingAttendanceHistory(tenantId, meetingHistoryPage, meetingHistoryFilters), enabled: Boolean(tenantId && isKagawad) })
  const rsvpHistory = useQuery({ queryKey: ['kagawad-meeting-rsvp-history', tenantId, rsvpHistoryPage, rsvpHistoryFilters], queryFn: () => listKagawadMeetingInvitationResponseHistory(tenantId, rsvpHistoryPage, rsvpHistoryFilters), enabled: Boolean(tenantId && isKagawad) })
  const correctionRequests = useQuery({ queryKey: ['kagawad-attendance-correction-requests', tenantId, correctionRequestPage, correctionRequestFilters], queryFn: () => listKagawadAttendanceCorrectionRequests(tenantId, correctionRequestPage, correctionRequestFilters), enabled: Boolean(tenantId && isKagawad) })
  useEffect(() => {
    if (!focusId) return
    if (meetingSearchInput) skipNextMeetingSearchReset.current = true
    setMeetingSearchInput(''); setMeetingSearch(''); setMeetingStatus('all'); setStartsOnOrAfter(''); setStartsOnOrBefore('')
    setPage(Math.max(0, focusPage ?? 0)); setSelectedMeeting(focusId); setAttendanceSearch('')
  }, [focusId, focusPage, meetingSearchInput])
  useEffect(() => {
    if (!focusId || !meetings.data?.meetings.some((meeting) => meeting.id === focusId)) return
    const target = document.getElementById(`meeting-card-${focusId}`)
    if (!target) return
    target.focus({ preventScroll: true }); target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    onFocusHandled?.()
  }, [focusId, meetings.data, onFocusHandled])
  useEffect(() => {
    if (!meetings.isPending && !meetings.isError && page > 0 && meetings.data?.meetings.length === 0) setPage((current) => Math.max(0, current - 1))
  }, [meetings.data?.meetings.length, meetings.isError, meetings.isPending, page])
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'meeting.manage'], queryFn: () => hasPermission(tenantId, 'meeting.manage'), enabled: Boolean(tenantId) })
  const canManageAttendance = useQuery({ queryKey: ['permission', tenantId, 'attendance.manage'], queryFn: () => hasPermission(tenantId, 'attendance.manage'), enabled: Boolean(tenantId) })
  const correctionQueue = useQuery({ queryKey: ['meeting-attendance-correction-queue', tenantId, correctionQueuePage], queryFn: () => listMeetingAttendanceCorrectionQueue(tenantId, correctionQueuePage), enabled: Boolean(tenantId && canManageAttendance.data) })
  useEffect(() => {
    if (!focusCorrectionRequestId) return
    if (focusCorrectionQueue) setCorrectionQueuePage(focusCorrectionPage ?? 0)
    else {
      const empty = { search: '', status: 'all', requestedAttendance: 'all', submittedAfter: '', submittedBefore: '' }
      setCorrectionRequestDraft(empty); setCorrectionRequestFilters(empty)
      setCorrectionRequestPage(focusCorrectionPage ?? 0)
    }
  }, [focusCorrectionRequestId, focusCorrectionPage, focusCorrectionQueue])
  useEffect(() => {
    if (!focusCorrectionRequestId) return
    const loading = focusCorrectionQueue ? correctionQueue.isPending : correctionRequests.isPending
    if (loading) return
    const requestExists = focusCorrectionQueue
      ? correctionQueue.data?.some((request) => request.id === focusCorrectionRequestId)
      : correctionRequests.data?.some((request) => request.id === focusCorrectionRequestId)
    if (!requestExists) { onFocusHandled?.(); return }
    const target = document.getElementById(`attendance-correction-${focusCorrectionQueue ? 'review-' : ''}${focusCorrectionRequestId}`)
    if (!target) return
    target.focus({ preventScroll: true })
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    onFocusHandled?.()
  }, [focusCorrectionRequestId, focusCorrectionQueue, correctionRequests.data, correctionRequests.isPending, correctionQueue.data, correctionQueue.isPending, onFocusHandled])
  const canSelectAttendees = useQuery({ queryKey: ['permission', tenantId, 'membership.read'], queryFn: () => hasPermission(tenantId, 'membership.read'), enabled: Boolean(tenantId) })
  const members = useQuery({ queryKey: ['meeting-attendee-members', selectedMeeting], queryFn: () => listMeetingAttendeeMembers(selectedMeeting), enabled: Boolean(selectedMeeting && canManage.data) })
  const memberDirectory = useQuery({
    queryKey: ['meeting-member-directory', tenantId, memberPage, memberSearch],
    queryFn: () => listMeetingMemberPage(tenantId, memberPage, memberSearch),
    enabled: Boolean(tenantId && canSelectAttendees.data && open),
  })
  const [busy, setBusy] = useState(false)
  const [rsvpBusyMeetingId, setRsvpBusyMeetingId] = useState('')
  const [calendarBusyMeetingId, setCalendarBusyMeetingId] = useState('')
  const [calendarExportError, setCalendarExportError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const attendance = useQuery({
    queryKey: ['attendance', selectedMeeting], queryFn: () => listAttendance(selectedMeeting), enabled: Boolean(selectedMeeting),
  })
  const attendees = useQuery({
    queryKey: ['meeting-attendees', selectedMeeting], queryFn: () => listMeetingAttendees(selectedMeeting),
    enabled: Boolean(selectedMeeting && canManage.data),
  })
  const invitationResponseSummary = useQuery({
    queryKey: ['meeting-invitation-response-summary', tenantId, selectedMeeting],
    queryFn: () => getMeetingInvitationResponseSummary(selectedMeeting),
    enabled: Boolean(selectedMeeting && tenantId && (canManage.data || canManageAttendance.data)),
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
    setBusy(true); setError(''); setMessage('')
    try {
      await markAttendance(id)
      await queryClient.invalidateQueries({ queryKey: ['attendance', id] })
      await queryClient.invalidateQueries({ queryKey: ['kagawad-invited-meetings', tenantId] })
      await queryClient.invalidateQueries({ queryKey: ['kagawad-meeting-participation', tenantId] })
      setMessage('Your attendance has been recorded.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Attendance could not be recorded.') }
    finally { setBusy(false) }
  }

  async function respondToMeetingInvitation(meetingId: string, response: 'attending' | 'unavailable' | 'withdrawn') {
    if (response === 'withdrawn' && !window.confirm('Withdraw your RSVP? You can respond again before the meeting starts.')) return
    setRsvpBusyMeetingId(meetingId); setError(''); setMessage('')
    try {
      await setKagawadMeetingInvitationResponse(meetingId, response)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['kagawad-invited-meetings', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['meeting-invitation-response-summary', tenantId, meetingId] }),
        queryClient.invalidateQueries({ queryKey: ['kagawad-meeting-rsvp-history', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['kagawad-meeting-participation', tenantId] }),
      ])
      setMessage(response === 'attending' ? 'Your plan to attend has been saved.' : response === 'unavailable' ? 'Your unavailability has been saved.' : 'Your RSVP has been withdrawn.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Your meeting response could not be saved.') }
    finally { setRsvpBusyMeetingId('') }
  }

  async function addInvitedMeetingToCalendar(meeting: KagawadInvitedMeeting) {
    setCalendarBusyMeetingId(meeting.id); setCalendarExportError('')
    try {
      const agenda = await getKagawadInvitedMeetingAgenda(meeting.id)
      exportMeetingCalendarFile({ ...meeting, agenda })
    } catch {
      setCalendarExportError('This meeting could not be added to your calendar. Refresh your invitations and try again.')
    } finally { setCalendarBusyMeetingId('') }
  }

  async function submitAttendanceCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!correctionMeetingId || correctionReason.trim().length < 3) {
      setError('Choose a past meeting and explain the attendance correction in at least 3 characters.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    try {
      await requestKagawadAttendanceCorrection(correctionMeetingId, correctionStatus, correctionReason.trim())
      setCorrectionReason('')
      setCorrectionMeetingId('')
      setCorrectionRequestPage(0)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['kagawad-attendance-correction-requests', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['meeting-attendance-correction-queue', tenantId] }),
      ])
      setMessage('Attendance correction request sent for review.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit the attendance correction request.') }
    finally { setBusy(false) }
  }

  async function reviewAttendanceCorrection(requestId: string, decision: 'approved' | 'rejected') {
    const reviewNote = correctionReviewNotes[requestId]?.trim() ?? ''
    if (decision === 'rejected' && reviewNote.length < 3) {
      setError('Add a review note of at least 3 characters before declining a request.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    try {
      await decideMeetingAttendanceCorrection(requestId, decision, reviewNote)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meeting-attendance-correction-queue', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['kagawad-attendance-correction-requests', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['kagawad-meeting-attendance-history', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['meetings', tenantId] }),
      ])
      setMessage(decision === 'approved' ? 'Attendance correction approved and recorded.' : 'Attendance correction request declined.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to review the attendance correction request.') }
    finally { setBusy(false) }
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

  async function exportMeetingSchedule() {
    setScheduleExportBusy(true); setScheduleExportError('')
    try {
      const rows = await listAllMeetingSchedule(tenantId, meetingSearch, meetingStatus, startsAfter, startsBefore)
      if (!rows.length) { setScheduleExportError('There are no matching meetings to export.'); return }
      const cell = (value: string) => {
        const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value
        return `"${safe.replaceAll('"', '""')}"`
      }
      const csv = `\uFEFF${[['Meeting', 'Location', 'Starts (UTC)', 'Ends (UTC)', 'Status'], ...rows.map((meeting) => [meeting.title, meeting.location, meeting.starts_at, meeting.ends_at ?? '', meeting.status])].map((row) => row.map(cell).join(',')).join('\r\n')}`
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = `kabalikat-meetings-${new Date().toISOString().slice(0, 10)}.csv`; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch { setScheduleExportError('The meeting schedule export could not be prepared. Refresh the list and try again.') }
    finally { setScheduleExportBusy(false) }
  }

  function exportMeetingCalendarFile(meeting: { id: string; title: string; location: string; starts_at: string; ends_at: string | null; agenda: string }) {
    const escapeIcsText = (value: string) => value.replaceAll('\\', '\\\\').replace(/\r?\n/g, '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;')
    const formatUtc = (value: Date) => value.toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z')
    const encoder = new TextEncoder()
    const foldLine = (line: string) => {
      const output: string[] = []
      let current = ''
      let byteLength = 0
      for (const character of line) {
        const size = encoder.encode(character).length
        if (byteLength + size > 75) { output.push(current); current = ' '; byteLength = 1 }
        current += character; byteLength += size
      }
      output.push(current)
      return output.join('\r\n')
    }
    const startsAt = new Date(meeting.starts_at)
    const endsAt = meeting.ends_at ? new Date(meeting.ends_at) : new Date(startsAt.getTime() + 60 * 60 * 1000)
    const description = meeting.agenda ? `DESCRIPTION:${escapeIcsText(meeting.agenda)}` : ''
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KABALIKAT//Community Meeting//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:${meeting.id}@kabalikat`, `DTSTAMP:${formatUtc(new Date())}`,
      `DTSTART:${formatUtc(startsAt)}`, `DTEND:${formatUtc(endsAt)}`, `SUMMARY:${escapeIcsText(meeting.title)}`,
      `LOCATION:${escapeIcsText(meeting.location)}`, ...(description ? [description] : []), 'END:VEVENT', 'END:VCALENDAR', '',
    ]
    const blobUrl = URL.createObjectURL(new Blob([lines.map(foldLine).join('\r\n')], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `${meeting.title.trim().replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meeting'}.ics`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000)
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
      {canManage.data && <div className="ops-form-actions"><button type="button" className="button outline" disabled={scheduleExportBusy || dateRangeInvalid || !meetings.data?.total} onClick={() => void exportMeetingSchedule()}><Download size={16} />{scheduleExportBusy ? 'Preparing export…' : 'Export schedule'}</button><button className="button primary" onClick={toggleMeetingForm}><CalendarDays size={16} />Schedule meeting</button></div>}
    </PageHeading>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view meetings and attendance." />}
    {Boolean(tenantId) && (canManage.isPending || canManageAttendance.isPending || canSelectAttendees.isPending) && <LoadingNotice compact />}
    {(canManage.error || canManageAttendance.error || canSelectAttendees.error) && <ErrorNotice message="Some meeting permissions could not be checked. Related scheduling, attendance, or invite controls may be unavailable until access can be verified." />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}{calendarExportError && <ErrorNotice message={calendarExportError} />}
    {isKagawad && <section className="ops-panel kagawad-invited-meetings" aria-labelledby="kagawad-invited-meetings-title">
      <div className="ops-panel-heading"><div><h2 id="kagawad-invited-meetings-title">My invited meetings</h2><p>Share your plan ahead of time. RSVP does not record attendance; check in when the window opens.</p></div><CalendarDays size={19} /></div>
      <form className="kagawad-invited-meeting-filters" onSubmit={(event) => { event.preventDefault(); if (invitedMeetingDraft.meetingDateAfter && invitedMeetingDraft.meetingDateBefore && invitedMeetingDraft.meetingDateAfter > invitedMeetingDraft.meetingDateBefore) return; setInvitedMeetingPage(0); setInvitedMeetingFilters({ ...invitedMeetingDraft, search: invitedMeetingDraft.search.trim() }) }}>
        <label>Search meetings<input type="search" maxLength={100} placeholder="Meeting title or location" value={invitedMeetingDraft.search} onChange={(event) => setInvitedMeetingDraft((current) => ({ ...current, search: event.target.value }))} /></label>
        <label>My RSVP<select value={invitedMeetingDraft.response} onChange={(event) => setInvitedMeetingDraft((current) => ({ ...current, response: event.target.value }))}><option value="all">All invitations</option><option value="no_response">RSVP needed</option><option value="attending">Plan to attend</option><option value="unavailable">Unavailable</option></select></label>
        <label>Meeting on or after<input type="date" max={invitedMeetingDraft.meetingDateBefore || undefined} value={invitedMeetingDraft.meetingDateAfter} onChange={(event) => setInvitedMeetingDraft((current) => ({ ...current, meetingDateAfter: event.target.value }))} /></label>
        <label>Meeting on or before<input type="date" min={invitedMeetingDraft.meetingDateAfter || undefined} value={invitedMeetingDraft.meetingDateBefore} onChange={(event) => setInvitedMeetingDraft((current) => ({ ...current, meetingDateBefore: event.target.value }))} /></label>
        <div className="kagawad-invited-meeting-filter-actions"><button className="button primary" type="submit">Apply filters</button><button className="button outline" type="button" onClick={() => { const empty = { search: '', response: 'all', meetingDateAfter: '', meetingDateBefore: '' }; setInvitedMeetingDraft(empty); setInvitedMeetingFilters(empty); setInvitedMeetingPage(0) }}>Clear</button></div>
      </form>
      {invitedMeetingDraft.meetingDateAfter && invitedMeetingDraft.meetingDateBefore && invitedMeetingDraft.meetingDateAfter > invitedMeetingDraft.meetingDateBefore && <p className="field-hint" role="alert">The start date must be on or before the end date.</p>}
      {invitedMeetings.isPending ? <LoadingNotice compact /> : invitedMeetings.error ? <ErrorNotice message="Your meeting invitations could not be loaded." onRetry={() => void invitedMeetings.refetch()} retrying={invitedMeetings.isFetching} /> : invitedMeetings.data?.length ? <>
        <ul className="kagawad-invited-meeting-list">{invitedMeetings.data.map((meeting) => <li key={meeting.id}>
          <div><strong>{meeting.title}</strong><small>{meeting.location} · {formatDateTime(meeting.starts_at)}</small></div>
          <div className="kagawad-meeting-response-actions" aria-label={`Your response for ${meeting.title}`}>
            <span className="field-hint">{meeting.invitation_response === 'attending' ? 'You plan to attend' : meeting.invitation_response === 'unavailable' ? 'You are unavailable' : new Date(meeting.starts_at).getTime() > Date.now() ? 'No response yet' : 'RSVP is closed'}</span>
            <button type="button" className={`button ${meeting.invitation_response === 'attending' ? 'primary' : 'outline'}`} disabled={rsvpBusyMeetingId === meeting.id || Boolean(meeting.attendance_status) || new Date(meeting.starts_at).getTime() <= Date.now()} onClick={() => void respondToMeetingInvitation(meeting.id, 'attending')}>{rsvpBusyMeetingId === meeting.id ? 'Saving…' : 'Plan to attend'}</button>
            <button type="button" className={`button ${meeting.invitation_response === 'unavailable' ? 'primary' : 'outline'}`} disabled={rsvpBusyMeetingId === meeting.id || Boolean(meeting.attendance_status) || new Date(meeting.starts_at).getTime() <= Date.now()} onClick={() => void respondToMeetingInvitation(meeting.id, 'unavailable')}>Unavailable</button>
            <button type="button" className="button outline" disabled={calendarBusyMeetingId === meeting.id} onClick={() => void addInvitedMeetingToCalendar(meeting)}><CalendarPlus size={15} />{calendarBusyMeetingId === meeting.id ? 'Preparing calendar…' : 'Add to calendar'}</button>
            {meeting.invitation_response && <button type="button" className="button outline" disabled={rsvpBusyMeetingId === meeting.id || Boolean(meeting.attendance_status) || new Date(meeting.starts_at).getTime() <= Date.now()} onClick={() => void respondToMeetingInvitation(meeting.id, 'withdrawn')}>Withdraw RSVP</button>}
          </div>
          <KagawadMeetingAgenda meetingId={meeting.id} />
          {meeting.attendance_status ? <StatusPill status={meeting.attendance_status} /> : meeting.check_in_open
            ? <button type="button" className="button primary" disabled={busy} onClick={() => void checkIn(meeting.id)}>I’m attending</button>
            : <span className="field-hint">Check-in opens 30 minutes before start</span>}
        </li>)}</ul>
        {Number(invitedMeetings.data[0]?.total_count ?? 0) > 10 && <nav className="committee-picker-pagination" aria-label="Invited meeting pages"><span>Page {invitedMeetingPage + 1} of {Math.ceil(Number(invitedMeetings.data[0]?.total_count ?? 0) / 10)} · {invitedMeetings.data[0]?.total_count} meetings</span><div><button type="button" className="button outline" disabled={invitedMeetingPage === 0 || invitedMeetings.isFetching} onClick={() => setInvitedMeetingPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={(invitedMeetingPage + 1) * 10 >= Number(invitedMeetings.data[0]?.total_count ?? 0) || invitedMeetings.isFetching} onClick={() => setInvitedMeetingPage((current) => current + 1)}>Next</button></div></nav>}
      </> : <p className="field-hint">{invitedMeetingFilters.search || invitedMeetingFilters.response !== 'all' || invitedMeetingFilters.meetingDateAfter || invitedMeetingFilters.meetingDateBefore ? 'No upcoming invitations match these filters.' : 'You have no upcoming invitations that need check-in.'}</p>}
    </section>}
    {isKagawad && <section className="ops-panel kagawad-invited-meetings" aria-labelledby="kagawad-meeting-rsvp-history-title">
      <div className="ops-panel-heading"><div><h2 id="kagawad-meeting-rsvp-history-title">My RSVP history</h2><p>Review your previous availability responses. These entries are not attendance records.</p></div><History size={19} /></div>
      <form className="kagawad-rsvp-history-filters" onSubmit={(event) => { event.preventDefault(); if (rsvpHistoryDraft.meetingDateAfter && rsvpHistoryDraft.meetingDateBefore && rsvpHistoryDraft.meetingDateAfter > rsvpHistoryDraft.meetingDateBefore) return; setRsvpHistoryPage(0); setRsvpHistoryFilters({ ...rsvpHistoryDraft, search: rsvpHistoryDraft.search.trim() }) }}>
        <label>Search meeting title<input type="search" maxLength={100} placeholder="Meeting title" value={rsvpHistoryDraft.search} onChange={(event) => setRsvpHistoryDraft((current) => ({ ...current, search: event.target.value }))} /></label>
        <label>Response<select value={rsvpHistoryDraft.response} onChange={(event) => setRsvpHistoryDraft((current) => ({ ...current, response: event.target.value }))}><option value="all">All responses</option><option value="attending">Plan to attend</option><option value="unavailable">Unavailable</option><option value="withdrawn">Withdrawn</option></select></label>
        <label>Meeting on or after<input type="date" max={rsvpHistoryDraft.meetingDateBefore || undefined} value={rsvpHistoryDraft.meetingDateAfter} onChange={(event) => setRsvpHistoryDraft((current) => ({ ...current, meetingDateAfter: event.target.value }))} /></label>
        <label>Meeting on or before<input type="date" min={rsvpHistoryDraft.meetingDateAfter || undefined} value={rsvpHistoryDraft.meetingDateBefore} onChange={(event) => setRsvpHistoryDraft((current) => ({ ...current, meetingDateBefore: event.target.value }))} /></label>
        <div className="kagawad-rsvp-history-actions"><button className="button primary" type="submit">Apply filters</button><button className="button outline" type="button" onClick={() => { const empty = { search: '', response: 'all', meetingDateAfter: '', meetingDateBefore: '' }; setRsvpHistoryDraft(empty); setRsvpHistoryFilters(empty); setRsvpHistoryPage(0) }}>Clear</button></div>
      </form>
      {rsvpHistoryDraft.meetingDateAfter && rsvpHistoryDraft.meetingDateBefore && rsvpHistoryDraft.meetingDateAfter > rsvpHistoryDraft.meetingDateBefore && <p className="account-security-error" role="alert">The start date must be on or before the end date.</p>}
      {rsvpHistory.isPending ? <LoadingNotice compact /> : rsvpHistory.error ? <ErrorNotice message="Your RSVP history could not be loaded." onRetry={() => void rsvpHistory.refetch()} retrying={rsvpHistory.isFetching} /> : rsvpHistory.data?.length ? <>
        <ul className="kagawad-invited-meeting-list">{rsvpHistory.data.map((entry) => <li key={entry.id}>
          <div><strong>{entry.meeting_title}</strong><small>Meeting date: {formatDateTime(entry.meeting_starts_at)}</small><small>Response: {entry.response === 'attending' ? 'Plan to attend' : entry.response === 'unavailable' ? 'Unavailable' : 'Withdrawn'} · Saved {formatDateTime(entry.responded_at)}</small></div>
          <StatusPill status={entry.response} />
        </li>)}</ul>
        {Number(rsvpHistory.data[0]?.total_count ?? 0) > 10 && <nav className="committee-picker-pagination" aria-label="RSVP history pages"><span>Page {rsvpHistoryPage + 1} of {Math.ceil(Number(rsvpHistory.data[0]?.total_count ?? 0) / 10)} · {rsvpHistory.data[0]?.total_count} responses</span><div><button type="button" className="button outline" disabled={rsvpHistoryPage === 0 || rsvpHistory.isFetching} onClick={() => setRsvpHistoryPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={(rsvpHistoryPage + 1) * 10 >= Number(rsvpHistory.data[0]?.total_count ?? 0) || rsvpHistory.isFetching} onClick={() => setRsvpHistoryPage((current) => current + 1)}>Next</button></div></nav>}
      </> : <p className="field-hint">{rsvpHistoryFilters.search || rsvpHistoryFilters.response !== 'all' || rsvpHistoryFilters.meetingDateAfter || rsvpHistoryFilters.meetingDateBefore ? 'No RSVP changes match these filters.' : 'Your RSVP changes will appear here.'}</p>}
    </section>}
    {isKagawad && <section className="ops-panel kagawad-invited-meetings" aria-labelledby="kagawad-meeting-history-title">
      <div className="ops-panel-heading"><div><h2 id="kagawad-meeting-history-title">My meeting history</h2><p>Past meetings you were invited to and your recorded attendance.</p></div><History size={19} /></div>
      <form className="kagawad-meeting-history-filters" onSubmit={(event) => { event.preventDefault(); if (meetingHistoryDraft.meetingDateAfter && meetingHistoryDraft.meetingDateBefore && meetingHistoryDraft.meetingDateAfter > meetingHistoryDraft.meetingDateBefore) return; setMeetingHistoryPage(0); setMeetingHistoryFilters({ ...meetingHistoryDraft, search: meetingHistoryDraft.search.trim() }) }}>
        <label>Search meetings<input type="search" maxLength={100} placeholder="Meeting title or location" value={meetingHistoryDraft.search} onChange={(event) => setMeetingHistoryDraft((current) => ({ ...current, search: event.target.value }))} /></label>
        <label>Attendance<select value={meetingHistoryDraft.attendanceStatus} onChange={(event) => setMeetingHistoryDraft((current) => ({ ...current, attendanceStatus: event.target.value }))}><option value="all">All records</option><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option><option value="unrecorded">Not recorded</option></select></label>
        <label>Meeting on or after<input type="date" value={meetingHistoryDraft.meetingDateAfter} onChange={(event) => setMeetingHistoryDraft((current) => ({ ...current, meetingDateAfter: event.target.value }))} /></label>
        <label>Meeting on or before<input type="date" value={meetingHistoryDraft.meetingDateBefore} onChange={(event) => setMeetingHistoryDraft((current) => ({ ...current, meetingDateBefore: event.target.value }))} /></label>
        <div className="kagawad-meeting-history-filter-actions"><button className="button primary" type="submit">Apply filters</button><button className="button outline" type="button" onClick={() => { const empty = { search: '', attendanceStatus: 'all', meetingDateAfter: '', meetingDateBefore: '' }; setMeetingHistoryDraft(empty); setMeetingHistoryFilters(empty); setMeetingHistoryPage(0) }}>Clear</button></div>
      </form>
      {meetingHistoryDraft.meetingDateAfter && meetingHistoryDraft.meetingDateBefore && meetingHistoryDraft.meetingDateAfter > meetingHistoryDraft.meetingDateBefore && <p className="field-hint" role="alert">The start date must be on or before the end date.</p>}
      {meetingHistory.isPending ? <LoadingNotice compact /> : meetingHistory.error ? <ErrorNotice message="Your meeting history could not be loaded." onRetry={() => void meetingHistory.refetch()} retrying={meetingHistory.isFetching} /> : meetingHistory.data?.length ? <>
        <ul className="kagawad-invited-meeting-list">{meetingHistory.data.map((meeting) => <li key={meeting.meeting_id}>
          <div><strong>{meeting.title}</strong><small>{meeting.location} · {formatDateTime(meeting.starts_at)}</small><small>Meeting: {meeting.meeting_status} · Attendance: {meeting.attendance_status ?? 'Not recorded'}{meeting.attendance_recorded_at ? ` · Recorded ${formatDateTime(meeting.attendance_recorded_at)}` : ''}</small></div>
          <StatusPill status={meeting.attendance_status ?? meeting.meeting_status} />
        </li>)}</ul>
        {Number(meetingHistory.data[0]?.total_count ?? 0) > 10 && <nav className="committee-picker-pagination" aria-label="Meeting history pages"><span>Page {meetingHistoryPage + 1} of {Math.ceil(Number(meetingHistory.data[0]?.total_count ?? 0) / 10)} · {meetingHistory.data[0]?.total_count} meetings</span><div><button type="button" className="button outline" disabled={meetingHistoryPage === 0 || meetingHistory.isFetching} onClick={() => setMeetingHistoryPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={(meetingHistoryPage + 1) * 10 >= Number(meetingHistory.data[0]?.total_count ?? 0) || meetingHistory.isFetching} onClick={() => setMeetingHistoryPage((current) => current + 1)}>Next</button></div></nav>}
      </> : <p className="field-hint">{meetingHistoryFilters.search || meetingHistoryFilters.attendanceStatus !== 'all' || meetingHistoryFilters.meetingDateAfter || meetingHistoryFilters.meetingDateBefore ? 'No past meetings match these filters.' : 'No past invited meetings are available yet.'}</p>}
      {meetingHistory.data?.length ? <form className="ops-form kagawad-attendance-correction-form" onSubmit={(event) => void submitAttendanceCorrection(event)}>
        <h3>Request an attendance correction</h3>
        <p className="field-hint">Choose a past meeting and explain what should be corrected. An authorized official will review the request.</p>
        <div className="ops-form-grid">
          <label>Meeting<select required value={correctionMeetingId} onChange={(event) => setCorrectionMeetingId(event.target.value)}><option value="">Choose a past meeting</option>{meetingHistory.data.map((meeting) => <option key={meeting.meeting_id} value={meeting.meeting_id}>{meeting.title} · {new Date(meeting.starts_at).toLocaleDateString()}</option>)}</select></label>
          <label>Correct attendance<select value={correctionStatus} onChange={(event) => setCorrectionStatus(event.target.value as typeof correctionStatus)}><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option></select></label>
          <label className="span-two">Reason<textarea required minLength={3} maxLength={1000} rows={3} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Explain why this attendance record needs correction" /></label>
        </div>
        <div className="ops-form-actions"><span className="field-hint">Requests are saved in your history and cannot be edited while awaiting review.</span><button className="button primary" disabled={busy || correctionReason.trim().length < 3}>{busy ? 'Sending…' : 'Send for review'}</button></div>
      </form> : null}
      <div className="kagawad-attendance-correction-history">
        <h3>Correction requests</h3>
        <form className="kagawad-correction-history-filters" onSubmit={(event) => { event.preventDefault(); if (correctionRequestDraft.submittedAfter && correctionRequestDraft.submittedBefore && correctionRequestDraft.submittedAfter > correctionRequestDraft.submittedBefore) return; setCorrectionRequestPage(0); setCorrectionRequestFilters({ ...correctionRequestDraft, search: correctionRequestDraft.search.trim() }) }}>
          <label>Search requests<input type="search" maxLength={100} placeholder="Meeting, reason, or review note" value={correctionRequestDraft.search} onChange={(event) => setCorrectionRequestDraft((current) => ({ ...current, search: event.target.value }))} /></label>
          <label>Request status<select value={correctionRequestDraft.status} onChange={(event) => setCorrectionRequestDraft((current) => ({ ...current, status: event.target.value }))}><option value="all">All statuses</option><option value="pending">Awaiting review</option><option value="approved">Approved</option><option value="rejected">Declined</option></select></label>
          <label>Requested attendance<select value={correctionRequestDraft.requestedAttendance} onChange={(event) => setCorrectionRequestDraft((current) => ({ ...current, requestedAttendance: event.target.value }))}><option value="all">All attendance</option><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option></select></label>
          <label>Submitted on or after<input type="date" value={correctionRequestDraft.submittedAfter} onChange={(event) => setCorrectionRequestDraft((current) => ({ ...current, submittedAfter: event.target.value }))} /></label>
          <label>Submitted on or before<input type="date" value={correctionRequestDraft.submittedBefore} onChange={(event) => setCorrectionRequestDraft((current) => ({ ...current, submittedBefore: event.target.value }))} /></label>
          <div className="kagawad-correction-history-filter-actions"><button className="button primary" type="submit">Apply filters</button><button className="button outline" type="button" onClick={() => { const empty = { search: '', status: 'all', requestedAttendance: 'all', submittedAfter: '', submittedBefore: '' }; setCorrectionRequestDraft(empty); setCorrectionRequestFilters(empty); setCorrectionRequestPage(0) }}>Clear</button></div>
        </form>
        {correctionRequestDraft.submittedAfter && correctionRequestDraft.submittedBefore && correctionRequestDraft.submittedAfter > correctionRequestDraft.submittedBefore && <p className="field-hint" role="alert">The start date must be on or before the end date.</p>}
        {correctionRequests.isPending ? <LoadingNotice compact /> : correctionRequests.error ? <ErrorNotice message="Your correction requests could not be loaded." onRetry={() => void correctionRequests.refetch()} retrying={correctionRequests.isFetching} /> : correctionRequests.data?.length ? <>
          <ul className="kagawad-invited-meeting-list">{correctionRequests.data.map((request) => <li id={`attendance-correction-${request.id}`} tabIndex={-1} key={request.id}>
            <div><strong>{request.meeting_title}</strong><small>{request.current_status ? `Recorded ${request.current_status} → requested ${request.requested_status}` : `Requested ${request.requested_status}; no prior record`}</small><small>{request.reason} · Submitted {formatDateTime(request.created_at)}</small>{request.review_note && <small>Review note: {request.review_note}</small>}</div>
            <StatusPill status={request.status} />
          </li>)}</ul>
          {Number(correctionRequests.data[0]?.total_count ?? 0) > 10 && <nav className="committee-picker-pagination" aria-label="Attendance correction request pages"><span>Page {correctionRequestPage + 1} of {Math.ceil(Number(correctionRequests.data[0]?.total_count ?? 0) / 10)} · {correctionRequests.data[0]?.total_count} requests</span><div><button type="button" className="button outline" disabled={correctionRequestPage === 0 || correctionRequests.isFetching} onClick={() => setCorrectionRequestPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={(correctionRequestPage + 1) * 10 >= Number(correctionRequests.data[0]?.total_count ?? 0) || correctionRequests.isFetching} onClick={() => setCorrectionRequestPage((current) => current + 1)}>Next</button></div></nav>}
        </> : <p className="field-hint">{correctionRequestFilters.search || correctionRequestFilters.status !== 'all' || correctionRequestFilters.requestedAttendance !== 'all' || correctionRequestFilters.submittedAfter || correctionRequestFilters.submittedBefore ? 'No attendance correction requests match these filters.' : 'You have not requested an attendance correction.'}</p>}
      </div>
    </section>}
    {canManageAttendance.data && <section className="ops-panel kagawad-invited-meetings" aria-labelledby="attendance-correction-queue-title">
      <div className="ops-panel-heading"><div><h2 id="attendance-correction-queue-title">Attendance corrections</h2><p>Review corrections submitted by invited Kagawads.</p></div><ClipboardList size={19} /></div>
      {correctionQueue.isPending ? <LoadingNotice compact /> : correctionQueue.error ? <ErrorNotice message="Attendance correction requests could not be loaded." onRetry={() => void correctionQueue.refetch()} retrying={correctionQueue.isFetching} /> : correctionQueue.data?.length ? <>
        <ul className="kagawad-invited-meeting-list">{correctionQueue.data.map((request) => <li id={`attendance-correction-review-${request.id}`} tabIndex={-1} key={request.id} className="attendance-correction-review-item">
          <div><strong>{request.meeting_title}</strong><small>{request.requester_name} · {formatDateTime(request.meeting_starts_at)}</small><small>{request.current_status ? `Recorded ${request.current_status} → requested ${request.requested_status}` : `No attendance recorded → requested ${request.requested_status}`}</small><small>{request.reason}</small>
            <label className="attendance-correction-review-note">Review note<textarea maxLength={1000} rows={2} value={correctionReviewNotes[request.id] ?? ''} onChange={(event) => setCorrectionReviewNotes((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Required when declining" /></label>
            <div className="ops-form-actions"><button type="button" className="button outline" disabled={busy} onClick={() => void reviewAttendanceCorrection(request.id, 'rejected')}>Decline</button><button type="button" className="button primary" disabled={busy} onClick={() => void reviewAttendanceCorrection(request.id, 'approved')}>Approve correction</button></div>
          </div>
        </li>)}</ul>
        {Number(correctionQueue.data[0]?.total_count ?? 0) > 10 && <nav className="committee-picker-pagination" aria-label="Attendance correction review pages"><span>Page {correctionQueuePage + 1} of {Math.ceil(Number(correctionQueue.data[0]?.total_count ?? 0) / 10)} · {correctionQueue.data[0]?.total_count} requests</span><div><button type="button" className="button outline" disabled={correctionQueuePage === 0 || correctionQueue.isFetching} onClick={() => setCorrectionQueuePage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={(correctionQueuePage + 1) * 10 >= Number(correctionQueue.data[0]?.total_count ?? 0) || correctionQueue.isFetching} onClick={() => setCorrectionQueuePage((current) => current + 1)}>Next</button></div></nav>}
      </> : <p className="field-hint">No attendance corrections are waiting for review.</p>}
    </section>}
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
    {tenantId && <div className="incident-filters"><label className="archive-search"><Search size={16} /><input type="search" aria-label="Search meetings" maxLength={100} placeholder="Search title, location, or agenda" value={meetingSearchInput} onChange={(event) => setMeetingSearchInput(event.target.value)} /></label><label>Meeting status<select value={meetingStatus} onChange={(event) => { setMeetingStatus(event.target.value as typeof meetingStatus); setPage(0) }}><option value="all">All statuses</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label><label>Starts on or after<input type="date" value={startsOnOrAfter} max={startsOnOrBefore || undefined} onChange={(event) => { setStartsOnOrAfter(event.target.value); setPage(0) }} /></label><label>Starts on or before<input type="date" value={startsOnOrBefore} min={startsOnOrAfter || undefined} onChange={(event) => { setStartsOnOrBefore(event.target.value); setPage(0) }} /></label>{(startsOnOrAfter || startsOnOrBefore) && <button type="button" className="button outline" onClick={() => { setStartsOnOrAfter(''); setStartsOnOrBefore(''); setPage(0) }}>Clear dates</button>}</div>}
    {dateRangeInvalid && <p className="account-security-error" role="alert">The end date must be the same day or later than the start date.</p>}
    {scheduleExportError && <p className="account-security-error" role="alert">{scheduleExportError}</p>}
    {(startsOnOrAfter || startsOnOrBefore) && !dateRangeInvalid && <p className="field-hint">Dates use your local timezone. The queue and schedule CSV use this same start-date window.</p>}
    {!tenantId ? null : dateRangeInvalid ? null : meetings.isPending ? <LoadingNotice /> : meetings.error ? <ErrorNotice message={meetings.error.message} onRetry={() => void meetings.refetch()} retrying={meetings.isFetching} /> : meetings.data?.total ? meetings.data.meetings.length ?
      <div className="ops-meeting-list">{meetings.data.meetings.map((meeting) => <article id={`meeting-card-${meeting.id}`} tabIndex={-1} className="ops-panel meeting-card" key={meeting.id}>
        <div className="meeting-card-top"><div className="request-icon"><CalendarDays size={18} /></div><div className="meeting-title"><h2>{meeting.title}</h2><p>{meeting.location} · {formatDateTime(meeting.starts_at)}</p></div><StatusPill status={meeting.status} /></div>
        {meeting.agenda && <div className="meeting-agenda"><strong><ClipboardList size={14} />Agenda</strong><p>{meeting.agenda}</p></div>}
        <div className="meeting-actions"><button className="button outline" onClick={() => { setAttendanceSearch(''); setSelectedMeeting((current) => current === meeting.id ? '' : meeting.id) }}>{selectedMeeting === meeting.id ? 'Hide meeting details' : 'View attendance & records'}</button>
          {meeting.status === 'scheduled' && !isKagawad && <button className="button primary" onClick={() => void checkIn(meeting.id)}>I’m attending</button>}
          {meeting.status === 'scheduled' && <button className="button outline" onClick={() => exportMeetingCalendarFile(meeting)}><CalendarPlus size={15} />Add to calendar</button>}
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
          {(canManage.data || canManageAttendance.data) && <div className="meeting-attendance-summary" aria-label="Meeting invitation responses">
            {invitationResponseSummary.isPending ? <span>Loading RSVP totals…</span> : invitationResponseSummary.error ? <span>RSVP totals are unavailable.</span> : invitationResponseSummary.data && <>
              <span><strong>{invitationResponseSummary.data.invited_count}</strong> Invited</span><span><strong>{invitationResponseSummary.data.attending_count}</strong> Plan to attend</span><span><strong>{invitationResponseSummary.data.unavailable_count}</strong> Unavailable</span><span><strong>{invitationResponseSummary.data.no_response_count}</strong> No response</span>
            </>}
          </div>}
          {(canManage.data || canManageAttendance.data) && <MeetingInvitationResponseRoster key={meeting.id} meetingId={meeting.id} />}
          {canManage.data && attendees.data && attendance.data && <div className="meeting-attendance-summary" aria-label="Attendance summary">
            <span><strong>{attendanceSummary.present}</strong> Present</span><span><strong>{attendanceSummary.absent}</strong> Absent</span><span><strong>{attendanceSummary.excused}</strong> Excused</span><span><strong>{unrecordedAttendeeCount}</strong> Not recorded</span>
            <button type="button" className="button outline" onClick={() => exportAttendanceCSV(meeting.title)}><Download size={15} />Export attendance CSV</button>
          </div>}
          <label className="archive-search attendance-search"><Search size={16} /><input type="search" aria-label="Search meeting attendees" maxLength={100} placeholder="Search attendees by name, role, or status" value={attendanceSearch} onChange={(event) => setAttendanceSearch(event.target.value)} /></label>
          {(attendance.data?.length || attendees.data?.length) ? <p className="field-hint attendance-search-count" aria-live="polite">Attendance records: {visibleAttendance.length} of {attendance.data?.length ?? 0}. Eligible roster: {visibleAttendees.length} of {attendees.data?.length ?? 0}.</p> : null}
          {attendance.isPending ? <LoadingNotice compact /> : attendance.error ? <ErrorNotice message={attendance.error.message} onRetry={() => void attendance.refetch()} retrying={attendance.isFetching} /> : attendance.data?.length ? visibleAttendance.length ? <ul>{visibleAttendance.map((item) => <li key={item.user_id}><span>{item.user_id === user?.id ? 'You' : members.data?.find((m) => m.user_id === item.user_id)?.profile?.display_name || 'Attendee'} <small>{item.source.replace('_', ' ')}</small></span><StatusPill status={item.status} /></li>)}</ul> : <p>No attendance record matches your search.</p> : <p>No attendance has been recorded yet.</p>}
          {canManage.data && <div className="attendance-roster">
            <strong>Eligible attendees <span className="field-hint">Official entries and corrections are audited.</span></strong>
            {attendees.isPending ? <LoadingNotice compact /> : attendees.error ? <ErrorNotice message={attendees.error.message} onRetry={() => void attendees.refetch()} retrying={attendees.isFetching} /> : attendees.data?.length ? visibleAttendees.length ? visibleAttendees.map(({ user_id: attendeeId }) => {
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
      </article>)}</div> : <EmptyNotice title="No meetings on this page" detail="Move to another page to see more meetings." /> : <EmptyNotice title={meetingSearch || meetingStatus !== 'all' || startsOnOrAfter || startsOnOrBefore ? 'No matching meetings' : 'No meetings scheduled'} detail={meetingSearch || meetingStatus !== 'all' || startsOnOrAfter || startsOnOrBefore ? 'Try another search, status, or date range.' : 'Meetings created for this barangay will appear here.'} />}
    {meetings.data && meetings.data.total > MEETING_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Meeting pages">
      <button className="button outline" disabled={page === 0 || meetings.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
      <span className="field-hint">Page {page + 1} of {Math.ceil(meetings.data.total / MEETING_PAGE_SIZE)}</span>
      <button className="button outline" disabled={(page + 1) * MEETING_PAGE_SIZE >= meetings.data.total || meetings.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button>
    </nav>}
    {reasonRequest && <MeetingReasonDialog {...reasonRequest} busy={reasonBusy} onCancel={() => { if (!reasonBusy) setReasonRequest(null) }} onConfirm={confirmReason} />}
  </section>
}

