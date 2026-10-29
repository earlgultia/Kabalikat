import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CalendarHeart, Download, MapPin, Search, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { listUpcomingCommunityEvents, type CommunityCalendarItem } from './community-calendar-data'
import { ErrorNotice, LoadingNotice, PageHeading } from './shared'
import { formatDateTime } from './format'

export function CommunityCalendarPage() {
  const { membership } = useAuth()
  const barangayId = membership?.barangay_id ?? ''
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<'all' | CommunityCalendarItem['source']>('all')
  const events = useQuery({
    queryKey: ['community-calendar', barangayId],
    queryFn: () => listUpcomingCommunityEvents(barangayId),
    enabled: Boolean(barangayId),
    staleTime: 60_000,
  })
  const term = search.trim().toLocaleLowerCase()
  const visibleEvents = (events.data ?? []).filter((event) => {
    const matchesSource = source === 'all' || event.source === source
    const matchesSearch = !term || [event.title, event.location, event.description].some((value) => value.toLocaleLowerCase().includes(term))
    return matchesSource && matchesSearch
  })

  function downloadCalendar() {
    const encoder = new TextEncoder()
    const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
    const foldLine = (line: string) => {
      const folded: string[] = []
      let current = ''
      let byteLength = 0
      for (const character of line) {
        const characterBytes = encoder.encode(character).length
        if (byteLength + characterBytes > 75) {
          folded.push(current)
          current = ` ${character}`
          byteLength = characterBytes + 1
        } else {
          current += character
          byteLength += characterBytes
        }
      }
      folded.push(current)
      return folded.join('\r\n')
    }
    const toUtc = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ArkByte Technologies//KABALIKAT//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH']
    for (const event of visibleEvents) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${event.id}@kabalikat.local`,
        `DTSTAMP:${toUtc(new Date().toISOString())}`,
        `DTSTART:${toUtc(event.starts_at)}`,
        `DTEND:${toUtc(event.ends_at)}`,
        `SUMMARY:${escapeText(event.title)}`,
        `LOCATION:${escapeText(event.location)}`,
        `CATEGORIES:${event.source === 'sk' ? 'SK PROGRAM' : 'HEALTH OUTREACH'}`,
        ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
        'END:VEVENT',
      )
    }
    lines.push('END:VCALENDAR')
    const blob = new Blob([lines.map(foldLine).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'kabalikat-community-calendar.ics'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="operation-page">
    <PageHeading title="Community calendar" description="See upcoming, Captain-approved SK programs and health outreach in one place." />
    <div className="ops-panel referral-privacy-notice"><ShieldAlert size={18} /><p><strong>Published schedules only.</strong> Drafts, participant registration, attendance lists, and patient information are not shown in this calendar.</p></div>
    {!!events.data?.length && <div className="community-calendar-filters">
      <label className="community-calendar-search"><Search size={16} /><input type="search" aria-label="Search community events" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by event or location" /></label>
      <label>Event type<select value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="all">All community events</option><option value="sk">SK programs</option><option value="health">Health outreach</option></select></label>
      <button className="button outline community-calendar-download" type="button" disabled={!visibleEvents.length} onClick={downloadCalendar}><Download size={15} />Download calendar file</button>
    </div>}
    {events.isPending && barangayId && <LoadingNotice />}
    {events.error && <ErrorNotice message={events.error.message} />}
    {!events.isPending && !events.error && events.data?.length === 0 && <div className="ops-empty"><CalendarDays size={22} /><strong>No upcoming community events</strong><p>Published SK programs and health outreach schedules will appear here.</p></div>}
    {events.data && events.data.length > 0 && visibleEvents.length === 0 && <div className="ops-empty"><CalendarDays size={22} /><strong>No matching events</strong><p>Try another event name, location, or event type.</p></div>}
    <div className="community-calendar-list">{visibleEvents.map((event) => <article className="ops-panel community-calendar-card" key={`${event.source}-${event.id}`}>
      <header><span className={`community-calendar-type ${event.source}`}>{event.source === 'sk' ? <CalendarDays size={15} /> : <CalendarHeart size={15} />}{event.source === 'sk' ? 'SK program' : 'Health outreach'}</span><time dateTime={event.starts_at}>{formatDateTime(event.starts_at)}</time></header>
      <h2>{event.title}</h2>
      <p className="community-calendar-location"><MapPin size={15} />{event.location}</p>
      {event.description && <p className="community-calendar-description">{event.description}</p>}
      <p className="community-calendar-end">Ends {formatDateTime(event.ends_at)}</p>
    </article>)}</div>
  </section>
}
