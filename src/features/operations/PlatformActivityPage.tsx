import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ChevronLeft, ChevronRight, Download, RefreshCw, RotateCcw, Search, ShieldCheck } from 'lucide-react'
import { formatDateTime } from './format'
import { ErrorNotice, LoadingNotice, PageHeading } from './shared'
import { listPlatformActivityPage, PLATFORM_ACTIVITY_PAGE_SIZE, type PlatformActivityEvent } from './platform-activity-data'
import { encodeCsv } from './csv'

const typeLabels: Record<string, string> = {
  barangay_onboarded: 'Barangay onboarded',
  subscription_created: 'Subscription created',
  subscription_updated: 'Subscription updated',
  subscription_plan_updated: 'Subscription plan updated',
}

function localDayStart(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null
}

function localDayAfter(value: string) {
  if (!value) return null
  const day = new Date(`${value}T00:00:00`)
  day.setDate(day.getDate() + 1)
  return day.toISOString()
}

export function PlatformActivityPage() {
  const [page, setPage] = useState(0)
  const [eventType, setEventType] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const validDateRange = !dateFrom || !dateTo || dateFrom <= dateTo
  const createdAfter = localDayStart(dateFrom)
  const createdBefore = localDayAfter(dateTo)
  const hasActiveFilters = eventType !== 'all' || Boolean(dateFrom || dateTo || searchInput.trim())
  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput.trim().slice(0, 100)); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  const activity = useQuery({
    queryKey: ['platform-activity', page, eventType, search, dateFrom, dateTo],
    queryFn: () => listPlatformActivityPage({ page, eventType, search, createdAfter, createdBefore }),
    enabled: validDateRange,
  })
  const totalPages = Math.ceil((activity.data?.totalCount ?? 0) / PLATFORM_ACTIVITY_PAGE_SIZE)

  async function exportActivity() {
    setExporting(true); setExportError('')
    try {
      const allEvents: PlatformActivityEvent[] = []
      for (let exportPage = 0; ; exportPage += 1) {
        const result = await listPlatformActivityPage({ page: exportPage, eventType, search, createdAfter, createdBefore })
        allEvents.push(...result.rows)
        if (allEvents.length >= result.totalCount || result.rows.length === 0) break
      }
      const csv = encodeCsv([
        ['Event ID', 'Recorded at', 'Action', 'Barangay', 'Actor', 'Summary'],
        ...allEvents.map((event) => [event.id, event.created_at, typeLabels[event.event_type] ?? event.event_type, event.barangay_name ?? 'Platform', event.actor_name, event.summary]),
      ])
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'kabalikat-platform-activity.csv'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setExportError('Unable to export all matching activity. Try again or narrow the filters.')
    } finally { setExporting(false) }
  }

  return <section className="operation-page platform-activity-page">
    <PageHeading title="Platform activity" description="Review recorded barangay onboarding, subscription changes, and plan catalog updates." />
    <div className="ops-panel platform-activity-guidance"><ShieldCheck size={18} /><p><strong>Limited, permanent activity records.</strong> This page records high-level platform actions only. Actor names are saved when an event is recorded, and entries cannot be edited or removed. It does not expose private barangay, resident, health, meeting, document, or finance records.</p></div>
    <div className="platform-activity-filters">
      <label className="archive-search"><Search size={16} /><input type="search" maxLength={100} aria-label="Search platform activity" placeholder="Search barangay, admin, or action" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
      <label>Action<select value={eventType} onChange={(event) => { setEventType(event.target.value); setPage(0) }}><option value="all">All activity</option><option value="barangay_onboarded">Barangay onboarding</option><option value="subscription_created">Subscription created</option><option value="subscription_updated">Subscription updated</option><option value="subscription_plan_updated">Plan catalog updated</option></select></label>
      <label className="platform-activity-date-filter" htmlFor="platform-activity-from">From<input id="platform-activity-from" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(0) }} /></label>
      <label className="platform-activity-date-filter" htmlFor="platform-activity-to">Through<input id="platform-activity-to" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(0) }} /></label>
      <button type="button" className="button outline" disabled={activity.isFetching || !validDateRange} onClick={() => void activity.refetch()}><RefreshCw size={15} />Refresh</button>
      <button type="button" className="button outline" disabled={!activity.data?.totalCount || activity.isFetching || exporting || !validDateRange} onClick={() => void exportActivity()}><Download size={15} />{exporting ? 'Exporting…' : 'Export matching activity'}</button>
      {hasActiveFilters && <button type="button" className="button outline" onClick={() => { setEventType('all'); setDateFrom(''); setDateTo(''); setSearchInput(''); setSearch(''); setPage(0) }}><RotateCcw size={15} />Clear filters</button>}
    </div>
    {exportError && <ErrorNotice message={exportError} />}
    {!validDateRange && <ErrorNotice message="Choose an end date on or after the start date." />}
    {activity.isPending ? <LoadingNotice /> : activity.error ? <ErrorNotice message="Unable to load platform activity." onRetry={() => void activity.refetch()} retrying={activity.isFetching} /> : activity.data?.rows.length ? <>
      <div className="platform-activity-list">{activity.data.rows.map((item) => {
        const planChange = item.event_type === 'subscription_plan_updated'
          ? item.summary.match(/^Plan (.+) metadata fields changed: (.+)$/)
          : null
        const changedFields = planChange?.[2].split(', ') ?? []
        return <article className="ops-panel platform-activity-card" key={item.id}>
        <div className="platform-activity-card-icon"><Activity size={18} /></div>
        <div className="platform-activity-card-content"><div className="platform-activity-card-heading"><strong>{typeLabels[item.event_type] ?? 'Platform activity'}</strong><time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time></div>
          <p>{planChange ? `Plan: ${planChange[1]}` : item.summary}</p>{changedFields.length > 0 && <div className="platform-activity-change-fields" aria-label="Changed plan fields">{changedFields.map((field) => <span key={field}>{field}</span>)}</div>}<div className="platform-activity-card-meta"><span>{item.barangay_name ?? 'Platform'}</span><span>By {item.actor_name}</span><span title={item.id} aria-label={`Event reference ${item.id}`}>Ref {item.id.slice(0, 8)}</span></div></div>
      </article>
      })}</div>
      {totalPages > 1 && <nav className="ops-panel ops-form-actions platform-activity-pagination" aria-label="Platform activity pages"><span className="muted">Page {page + 1} of {totalPages} · {activity.data.totalCount.toLocaleString()} events</span><div className="finance-review-actions"><button className="button outline" disabled={page === 0 || activity.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button><button className="button outline" disabled={page + 1 >= totalPages || activity.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button></div></nav>}
    </> : <div className="ops-empty"><Activity size={22} /><strong>{search || eventType !== 'all' ? 'No matching activity' : 'No platform activity yet'}</strong><p>{search || eventType !== 'all' ? 'Try a different search or action.' : 'Barangay onboarding, subscription, and plan catalog changes will appear here.'}</p></div>}
  </section>
}
