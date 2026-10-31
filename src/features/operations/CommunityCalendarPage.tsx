import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CalendarHeart, ChevronLeft, ChevronRight, Download, MapPin, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { COMMUNITY_CALENDAR_PAGE_SIZE, listAllCommunityEvents, listCommunityEventPage, type CommunityCalendarItem } from './community-calendar-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading } from './shared'
import { formatDateTime } from './format'

export function CommunityCalendarPage() {
  const { membership } = useAuth()
  const barangayId = membership?.barangay_id ?? ''
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<'all' | CommunityCalendarItem['source']>('all')
  const [page, setPage] = useState(0)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportProgress, setExportProgress] = useState('')
  const [exportError, setExportError] = useState('')
  const events = useQuery({
    queryKey: ['community-calendar', barangayId, page, search, source],
    queryFn: () => listCommunityEventPage(barangayId, page, search, source),
    enabled: Boolean(barangayId),
    staleTime: 60_000,
  })
  const visibleEvents = events.data?.events ?? []
  const totalPages = Math.ceil((events.data?.total ?? 0) / COMMUNITY_CALENDAR_PAGE_SIZE)

  async function downloadCalendar() {
    setExportBusy(true)
    setExportError('')
    try {
    const exportEvents = await listAllCommunityEvents(barangayId, search, source, setExportProgress)
    setExportProgress('Preparing calendar download…')
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
    for (const event of exportEvents) {
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
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Unable to download the community calendar.')
    } finally {
      setExportBusy(false)
      setExportProgress('')
    }
  }

  return <section className="operation-page">
    <PageHeading title="Community calendar" description="See upcoming, Captain-approved SK programs and health outreach in one place.">
      <button className="button outline" type="button" disabled={!barangayId || events.isFetching} onClick={() => void events.refetch()}><RefreshCw size={15} className={events.isFetching ? 'spin' : undefined} />{events.isFetching ? 'Refreshing…' : 'Refresh calendar'}</button>
    </PageHeading>
    <div className="ops-panel referral-privacy-notice"><ShieldAlert size={18} /><p><strong>Published schedules only.</strong> Drafts, participant registration, attendance lists, and patient information are not shown in this calendar.</p></div>
    {!barangayId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view published community schedules." />}
    {barangayId && <div className="community-calendar-filters">
      <label className="community-calendar-search"><Search size={16} /><input type="search" aria-label="Search community events" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Search by event or location" /></label>
      <label>Event type<select value={source} onChange={(event) => { setSource(event.target.value as typeof source); setPage(0) }}><option value="all">All community events</option><option value="sk">SK programs</option><option value="health">Health outreach</option></select></label>
      <button className="button outline community-calendar-download" type="button" disabled={!events.data?.total || exportBusy} onClick={() => void downloadCalendar()}><Download size={15} />{exportBusy ? 'Preparing…' : 'Download calendar file'}</button>
    </div>}
    {events.isPending && barangayId && <LoadingNotice />}
    {events.error && <ErrorNotice message={events.error.message} onRetry={() => void events.refetch()} retrying={events.isFetching} />}
    {exportError && <ErrorNotice message={exportError} />}
    {exportProgress && <p className="field-hint" role="status" aria-live="polite">{exportProgress}</p>}
    {!events.isPending && !events.error && events.data?.total === 0 && <div className="ops-empty"><CalendarDays size={22} /><strong>{search || source !== 'all' ? 'No matching events' : 'No upcoming community events'}</strong><p>{search || source !== 'all' ? 'Try another event name, location, or event type.' : 'Published SK programs and health outreach schedules will appear here.'}</p></div>}
    <div className="community-calendar-list">{visibleEvents.map((event) => <article className="ops-panel community-calendar-card" key={`${event.source}-${event.id}`}>
      <header><span className={`community-calendar-type ${event.source}`}>{event.source === 'sk' ? <CalendarDays size={15} /> : <CalendarHeart size={15} />}{event.source === 'sk' ? 'SK program' : 'Health outreach'}</span><time dateTime={event.starts_at}>{formatDateTime(event.starts_at)}</time></header>
      <h2>{event.title}</h2>
      <p className="community-calendar-location"><MapPin size={15} />{event.location}</p>
      {event.description && <p className="community-calendar-description">{event.description}</p>}
      <p className="community-calendar-end">Ends {formatDateTime(event.ends_at)}</p>
    </article>)}</div>
    {totalPages > 1 && <nav className="ops-form-actions" aria-label="Community calendar pages"><button type="button" className="button outline" disabled={page === 0 || events.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} />Previous</button><span className="field-hint">Page {page + 1} of {totalPages} · {events.data?.total.toLocaleString()} events</span><button type="button" className="button outline" disabled={page + 1 >= totalPages || events.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></nav>}
  </section>
}
