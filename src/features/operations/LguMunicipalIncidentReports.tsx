import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { ErrorNotice, LoadingNotice, StatusPill } from './shared'
import { formatDateTime } from './format'
import { getLguMunicipalIncidentSummary, LGU_MUNICIPAL_REPORT_PAGE_SIZE, listLguMunicipalIncidentReports, listLguPriorityIncidentsNeedingBarangayFollowUp } from './lgu-data'

export function LguMunicipalIncidentReports({ lguId, onOpenPendingEscalations }: { lguId: string; onOpenPendingEscalations: () => void }) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [severity, setSeverity] = useState('all')
  const [createdAfter, setCreatedAfter] = useState('')
  const [createdBefore, setCreatedBefore] = useState('')
  const [page, setPage] = useState(0)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const summary = useQuery({
    queryKey: ['lgu-municipal-incident-summary', lguId],
    queryFn: getLguMunicipalIncidentSummary,
    enabled: Boolean(lguId), refetchInterval: 30_000, refetchIntervalInBackground: false,
  })
  const priorityFollowUp = useQuery({
    queryKey: ['lgu-priority-incidents-needing-barangay-follow-up', lguId],
    queryFn: listLguPriorityIncidentsNeedingBarangayFollowUp,
    enabled: Boolean(lguId), refetchInterval: 30_000, refetchIntervalInBackground: false,
  })
  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 300)
    return () => window.clearTimeout(timeout)
  }, [searchInput])
  const reports = useQuery({
    queryKey: ['lgu-municipal-incident-reports', lguId, page, search, status, severity, createdAfter, createdBefore],
    queryFn: () => listLguMunicipalIncidentReports({ page, search, status, severity, createdAfter, createdBefore }),
    enabled: Boolean(lguId), refetchInterval: 30_000, refetchIntervalInBackground: false,
  })
  const total = Number(reports.data?.total_count ?? 0)
  const pages = Math.ceil(total / LGU_MUNICIPAL_REPORT_PAGE_SIZE)
  const hasFilters = Boolean(search || status !== 'all' || severity !== 'all' || createdAfter || createdBefore)
  useEffect(() => {
    if (page >= pages) setPage(Math.max(0, pages - 1))
  }, [page, pages])
  useEffect(() => {
    if (!selectedReportId || reports.isFetching) return
    const target = document.getElementById(`municipal-incident-${selectedReportId}`)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.focus({ preventScroll: true })
    }
  }, [selectedReportId, reports.data, reports.isFetching])

  function openPriorityReport(report: NonNullable<typeof priorityFollowUp.data>['rows'][number]) {
    setSelectedReportId(report.id)
    setSearchInput(report.summary)
    setSearch(report.summary)
    setStatus('all')
    setSeverity('all')
    setCreatedAfter('')
    setCreatedBefore('')
    setPage(0)
  }

  return <section className="ops-panel" aria-labelledby="lgu-all-incidents-title">
    <div className="ops-panel-heading"><div><h2 id="lgu-all-incidents-title"><AlertTriangle size={19} /> All barangay incident reports</h2><p>Read-only municipal view of reports from every linked barangay. Only Captain-escalated reports can be acknowledged by the LGU.</p></div><button type="button" className="button outline" disabled={reports.isFetching || summary.isFetching} onClick={() => void Promise.all([reports.refetch(),summary.refetch()])}><RefreshCw size={15} />Refresh</button></div>
    {summary.data && <div className="incident-summary" aria-label="Municipal incident workload"><div><strong>{Number(summary.data.open_reports).toLocaleString()}</strong><span>Open reports</span></div><div><strong>{Number(summary.data.urgent_open_reports).toLocaleString()}</strong><span>High or urgent open</span></div><div><strong>{Number(summary.data.reported_today).toLocaleString()}</strong><span>Reported today</span></div><button type="button" className="incident-summary-link" onClick={onOpenPendingEscalations} aria-label={`${Number(summary.data.pending_escalations)} pending escalations. Open LGU response queue.`}><strong>{Number(summary.data.pending_escalations).toLocaleString()}</strong><span>Awaiting LGU response · Open queue</span></button></div>}
    {summary.error && <ErrorNotice message="Incident workload totals could not be refreshed." onRetry={() => void summary.refetch()} retrying={summary.isFetching} />}
    {priorityFollowUp.error && <ErrorNotice message="High-priority barangay follow-up reports could not be loaded." onRetry={() => void priorityFollowUp.refetch()} retrying={priorityFollowUp.isFetching} />}
    {priorityFollowUp.data && priorityFollowUp.data.total_count > 0 && <div className="lgu-priority-follow-up" aria-labelledby="lgu-priority-follow-up-title">
      <div><h3 id="lgu-priority-follow-up-title"><AlertTriangle size={17} /> High-priority reports still with barangays</h3><p>These high or urgent reports have not been escalated. Contact the listed barangay if municipal coordination may help; the report remains under the Captain’s response.</p></div>
      <ul>{priorityFollowUp.data.rows.map((report) => <li key={report.id}><span className={`incident-severity severity-${report.severity}`}>{report.severity}</span><button type="button" className="lgu-priority-report-link" onClick={() => openPriorityReport(report)}>{report.summary}</button><span>{report.barangay_name} · {report.location}</span><time dateTime={report.created_at}>Reported {formatDateTime(report.created_at)}</time></li>)}</ul>
      {priorityFollowUp.data.total_count > priorityFollowUp.data.rows.length && <p className="lgu-priority-follow-up-more">Showing {priorityFollowUp.data.rows.length} of {priorityFollowUp.data.total_count.toLocaleString()} reports. Review the full municipal report list below for the rest.</p>}
    </div>}
    <div className="lgu-queue-filters">
      <label>Search reports<input type="search" maxLength={160} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Summary, barangay, category, or location" /></label>
      <label className="lgu-status-filter">Report status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}><option value="all">All report statuses</option><option value="submitted">Submitted</option><option value="acknowledged">Acknowledged</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label>
      <label className="lgu-status-filter">Severity<select value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(0) }}><option value="all">All severities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="moderate">Moderate</option><option value="low">Low</option></select></label>
      <label className="lgu-status-filter">Reported on or after<input type="date" value={createdAfter} max={createdBefore || undefined} onChange={(event) => { setCreatedAfter(event.target.value); setPage(0) }} /></label>
      <label className="lgu-status-filter">Reported on or before<input type="date" value={createdBefore} min={createdAfter || undefined} onChange={(event) => { setCreatedBefore(event.target.value); setPage(0) }} /></label>
      {(createdAfter || createdBefore) && <button type="button" className="button outline" onClick={() => { setCreatedAfter(''); setCreatedBefore(''); setPage(0) }}>Clear dates</button>}
    </div>
    {reports.isPending ? <LoadingNotice /> : reports.error ? <ErrorNotice message="Municipality incident reports could not be loaded." onRetry={() => void reports.refetch()} retrying={reports.isFetching} /> : reports.data?.rows.length ? <div className="lgu-escalation-list">{reports.data.rows.map((report) => <article id={`municipal-incident-${report.id}`} tabIndex={-1} className="lgu-escalation-card" key={report.id}>
      <header><div><span className={`incident-severity severity-${report.severity}`}>{report.severity}</span><h3>{report.summary}</h3></div><StatusPill status={report.status} /></header>
      <div className="incident-meta"><span>{report.barangay_name}</span><span>{report.category}</span><span>{report.location}</span><span>Reported {formatDateTime(report.created_at)}</span></div>
      <p>{report.details || 'No additional incident details were provided.'}</p>
      {report.escalation_status ? <div className="lgu-escalation-reason"><strong>LGU handoff: {report.escalation_status}</strong><p>{report.escalation_note || 'Captain escalated this report.'}</p>{report.lgu_response_note && <p><strong>LGU response:</strong> {report.lgu_response_note}</p>}</div> : <span className="field-hint">Not escalated; remains with the barangay Captain.</span>}
    </article>)}</div> : <div className="ops-empty"><AlertTriangle size={21} /><strong>{hasFilters ? 'No matching incident reports' : 'No barangay incident reports yet'}</strong><p>{hasFilters ? 'Try another search or adjust the status, severity, or date filters.' : 'Incident reports from this municipality’s linked barangays will appear here.'}</p></div>}
    {pages > 1 && <nav className="directory-pagination" aria-label="Municipal incident report pages"><button type="button" className="button outline" disabled={page === 0 || reports.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={15} />Previous</button><span>Page {page + 1} of {pages} · {total.toLocaleString()} reports</span><button type="button" className="button outline" disabled={page + 1 >= pages || reports.isFetching} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={15} /></button></nav>}
  </section>
}
