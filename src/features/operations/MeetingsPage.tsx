import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarDays, CheckCircle2, ClipboardList } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import {
  createMeeting, hasPermission, listAttendance, listMeetingAttendees, listMeetings, listTenantMembers,
  markAttendance, recordAttendance, updateMeetingStatus,
} from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'
import { MeetingRecordsPanel } from './MeetingRecordsPanel'
import { MeetingQrPanel } from './MeetingQrPanel'

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
  const meetings = useQuery({ queryKey: ['meetings', tenantId], queryFn: () => listMeetings(tenantId), enabled: Boolean(tenantId) })
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'meeting.manage'], queryFn: () => hasPermission(tenantId, 'meeting.manage'), enabled: Boolean(tenantId) })
  const canManageAttendance = useQuery({ queryKey: ['permission', tenantId, 'attendance.manage'], queryFn: () => hasPermission(tenantId, 'attendance.manage'), enabled: Boolean(tenantId) })
  const canSelectAttendees = useQuery({ queryKey: ['permission', tenantId, 'membership.read'], queryFn: () => hasPermission(tenantId, 'membership.read'), enabled: Boolean(tenantId) })
  const members = useQuery({ queryKey: ['tenant-members', tenantId], queryFn: () => listTenantMembers(tenantId), enabled: Boolean(tenantId && canSelectAttendees.data) })
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const attendance = useQuery({
    queryKey: ['attendance', selectedMeeting], queryFn: () => listAttendance(selectedMeeting), enabled: Boolean(selectedMeeting),
  })
  const attendees = useQuery({
    queryKey: ['meeting-attendees', selectedMeeting], queryFn: () => listMeetingAttendees(selectedMeeting),
    enabled: Boolean(selectedMeeting && canManage.data),
  })

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
      setSelectedMeeting(id); setMessage('Meeting created. You are added as an eligible attendee.')
      setSelectedAttendees([]); setOpen(false); form.reset()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create this meeting.') }
    finally { setBusy(false) }
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
    const reason = needsReason ? window.prompt(previous ? 'Reason for correcting this attendance record:' : `Reason for marking this attendee ${status}:`) : ''
    if (needsReason && !reason?.trim()) return
    try {
      await recordAttendance(id, attendeeId, status, reason ?? '')
      await queryClient.invalidateQueries({ queryKey: ['attendance', id] })
      setMessage('Attendance record saved and added to its audit history.')
      setError('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to record attendance.') }
  }

  async function setStatus(id: string, status: 'completed' | 'cancelled') {
    const reason = status === 'cancelled' ? window.prompt('Reason for cancelling this meeting:') : ''
    if (status === 'cancelled' && !reason?.trim()) return
    try {
      await updateMeetingStatus(id, status, reason ?? '')
      await queryClient.invalidateQueries({ queryKey: ['meetings', tenantId] })
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the meeting.') }
  }

  return <section className="operation-page">
    <PageHeading title="Meetings & attendance" description="Schedule meetings, share agendas with eligible members, and record attendance.">
      {canManage.data && <button className="button primary" onClick={() => setOpen((value) => !value)}><CalendarDays size={16} />Schedule meeting</button>}
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
      {canSelectAttendees.data && <div className="attendee-picker"><strong>Invite active members <span className="field-hint">Optional</span></strong>
        {members.isPending ? <LoadingNotice compact /> : members.error ? <p className="field-hint">Member names are not available to this role. You will be added as an attendee.</p> : <div className="attendee-list">{(members.data ?? []).filter((m) => m.user_id !== user?.id).map((member) => <label key={member.user_id}><input type="checkbox" checked={selectedAttendees.includes(member.user_id)} onChange={(event) => setSelectedAttendees((current) => event.target.checked ? [...current, member.user_id] : current.filter((id) => id !== member.user_id))} /><span>{member.profile?.display_name || 'Member'} · {member.role?.label ?? 'official'}</span></label>)}</div>}
      </div>}
      <div className="ops-form-actions"><span className="field-hint">Attendance self-check-in opens 30 minutes before start and closes 30 minutes after end.</span><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Create meeting'}</button></div>
    </form>}
    <div className="ops-section-title"><h2>Scheduled meetings</h2><p>Meeting lists and attendance are tenant- and role-scoped.</p></div>
    {!tenantId ? null : meetings.isPending ? <LoadingNotice /> : meetings.error ? <ErrorNotice message={meetings.error.message} /> : meetings.data?.length ?
      <div className="ops-meeting-list">{meetings.data.map((meeting) => <article className="ops-panel meeting-card" key={meeting.id}>
        <div className="meeting-card-top"><div className="request-icon"><CalendarDays size={18} /></div><div className="meeting-title"><h2>{meeting.title}</h2><p>{meeting.location} · {formatDateTime(meeting.starts_at)}</p></div><StatusPill status={meeting.status} /></div>
        {meeting.agenda && <div className="meeting-agenda"><strong><ClipboardList size={14} />Agenda</strong><p>{meeting.agenda}</p></div>}
        <div className="meeting-actions"><button className="button outline" onClick={() => setSelectedMeeting((current) => current === meeting.id ? '' : meeting.id)}>{selectedMeeting === meeting.id ? 'Hide meeting details' : 'View attendance & records'}</button>
          {meeting.status === 'scheduled' && <button className="button primary" onClick={() => void checkIn(meeting.id)}>I’m attending</button>}
          {canManage.data && meeting.status === 'scheduled' && <><button className="text-action" onClick={() => void setStatus(meeting.id, 'completed')}>Complete</button><button className="text-action danger-action" onClick={() => void setStatus(meeting.id, 'cancelled')}>Cancel</button></>}
        </div>
        {selectedMeeting === meeting.id && <div className="attendance-panel">
          {attendance.isPending ? <LoadingNotice compact /> : attendance.error ? <ErrorNotice message={attendance.error.message} /> : attendance.data?.length ? <ul>{attendance.data.map((item) => <li key={item.user_id}><span>{item.user_id === user?.id ? 'You' : members.data?.find((m) => m.user_id === item.user_id)?.profile?.display_name || 'Attendee'} <small>{item.source.replace('_', ' ')}</small></span><StatusPill status={item.status} /></li>)}</ul> : <p>No attendance has been recorded yet.</p>}
          {canManage.data && <div className="attendance-roster">
            <strong>Eligible attendees <span className="field-hint">Official entries and corrections are audited.</span></strong>
            {attendees.isPending ? <LoadingNotice compact /> : attendees.error ? <ErrorNotice message={attendees.error.message} /> : attendees.data?.length ? attendees.data.map(({ user_id: attendeeId }) => {
              const member = members.data?.find((item) => item.user_id === attendeeId)
              const entry = attendance.data?.find((item) => item.user_id === attendeeId)
              return <div className="attendance-roster-row" key={attendeeId}>
                <span>{member?.profile?.display_name || (attendeeId === user?.id ? 'You' : 'Member')}<small>{member?.role?.label ?? ''}</small></span>
                <div>{(['present', 'absent', 'excused'] as const).map((status) => <button key={status} className={entry?.status === status ? 'selected' : ''} onClick={() => void setAttendance(meeting.id, attendeeId, status)}>{status}</button>)}</div>
              </div>
            }) : <p>No eligible attendees have been assigned.</p>}
          </div>}
          <MeetingQrPanel meetingId={meeting.id} scheduled={meeting.status === 'scheduled'} canManage={Boolean(canManageAttendance.data)} />
          <MeetingRecordsPanel meetingId={meeting.id} meetingTitle={meeting.title} location={meeting.location}
            startsAt={meeting.starts_at} agenda={meeting.agenda} attendance={attendance.data ?? []} members={members.data ?? []}
            attendanceLoading={attendance.isPending || Boolean(attendance.error)}
            canManage={Boolean(canManage.data)} />
        </div>}
      </article>)}</div> : <EmptyNotice title="No meetings scheduled" detail="Meetings created for this barangay will appear here." />}
  </section>
}

