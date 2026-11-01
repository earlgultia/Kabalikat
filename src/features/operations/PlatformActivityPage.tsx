import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { formatDateTime } from './format'
import { ErrorNotice, LoadingNotice, PageHeading } from './shared'
import { listPlatformActivityPage, PLATFORM_ACTIVITY_PAGE_SIZE } from './platform-activity-data'

const typeLabels: Record<string, string> = {
  barangay_onboarded: 'Barangay onboarded',
  subscription_created: 'Subscription created',
  subscription_updated: 'Subscription updated',
}

export function PlatformActivityPage() {
  const [page, setPage] = useState(0)
  const [eventType, setEventType] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput.trim().slice(0, 100)); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  const activity = useQuery({
    queryKey: ['platform-activity', page, eventType, search],
    queryFn: () => listPlatformActivityPage({ page, eventType, search }),
  })
  const totalPages = Math.ceil((activity.data?.totalCount ?? 0) / PLATFORM_ACTIVITY_PAGE_SIZE)

  return <section className="operation-page platform-activity-page">
    <PageHeading title="Platform activity" description="Review recorded barangay onboarding and subscription changes." />
    <div className="ops-panel platform-activity-guidance"><ShieldCheck size={18} /><p><strong>Limited activity records.</strong> This page records high-level platform actions only. It does not expose private barangay, resident, health, meeting, document, or finance records.</p></div>
    <div className="platform-activity-filters">
      <label className="archive-search"><Search size={16} /><input type="search" maxLength={100} aria-label="Search platform activity" placeholder="Search barangay or action" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
      <label>Action<select value={eventType} onChange={(event) => { setEventType(event.target.value); setPage(0) }}><option value="all">All activity</option><option value="barangay_onboarded">Barangay onboarding</option><option value="subscription_created">Subscription created</option><option value="subscription_updated">Subscription updated</option></select></label>
      <button type="button" className="button outline" disabled={activity.isFetching} onClick={() => void activity.refetch()}><RefreshCw size={15} />Refresh</button>
    </div>
    {activity.isPending ? <LoadingNotice /> : activity.error ? <ErrorNotice message="Unable to load platform activity." onRetry={() => void activity.refetch()} retrying={activity.isFetching} /> : activity.data?.rows.length ? <>
      <div className="platform-activity-list">{activity.data.rows.map((item) => <article className="ops-panel platform-activity-card" key={item.id}>
        <div className="platform-activity-card-icon"><Activity size={18} /></div>
        <div className="platform-activity-card-content"><div className="platform-activity-card-heading"><strong>{typeLabels[item.event_type] ?? 'Platform activity'}</strong><time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time></div>
          <p>{item.summary}</p><div className="platform-activity-card-meta"><span>{item.barangay_name ?? 'Platform'}</span><span>By {item.actor_name}</span></div></div>
      </article>)}</div>
      {totalPages > 1 && <nav className="ops-panel ops-form-actions platform-activity-pagination" aria-label="Platform activity pages"><span className="muted">Page {page + 1} of {totalPages} · {activity.data.totalCount.toLocaleString()} events</span><div className="finance-review-actions"><button className="button outline" disabled={page === 0 || activity.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button><button className="button outline" disabled={page + 1 >= totalPages || activity.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button></div></nav>}
    </> : <div className="ops-empty"><Activity size={22} /><strong>{search || eventType !== 'all' ? 'No matching activity' : 'No platform activity yet'}</strong><p>{search || eventType !== 'all' ? 'Try a different search or action.' : 'Barangay onboarding and subscription changes will appear here.'}</p></div>}
  </section>
}
