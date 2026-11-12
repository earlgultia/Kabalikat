import { useEffect, useState, type FormEvent, type SyntheticEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, FileDown, Paperclip, Siren, Upload } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { addIncidentUpdate, assignIncident, createIncidentEvidenceDownloadUrl, escalateIncident, findVisibleIncidentPage, INCIDENT_HISTORY_PAGE_SIZE, INCIDENT_PAGE_SIZE, listIncidentBreakdown, listIncidentEvents, listIncidentEvidence, listIncidents, listIncidentSummary, submitIncident, transitionIncident, uploadIncidentEvidence } from './incident-data'
import { TanodPicker } from './TanodPicker'
import { IncidentResolutionDialog } from './IncidentResolutionDialog'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime, getManilaDateBoundary, getManilaDateInputValue } from './format'

const incidentSchema = z.object({ category: z.enum(['safety','hazard','disturbance','property','disaster','other']), severity: z.enum(['low','moderate','high','urgent']), location: z.string().trim().min(2).max(240), summary: z.string().trim().min(3).max(180), details: z.string().max(3000) })
const escalationSchema = z.object({ destination: z.string().trim().min(3).max(180), note: z.string().trim().min(3).max(1000), confirm: z.literal('yes') })
const statusLabels: Record<string, string> = { submitted: 'Submitted', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' }

function IncidentHistory({ tenantId, incidentId, ownStatusOnly }: { tenantId: string; incidentId: string; ownStatusOnly: boolean }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const history = useQuery({ queryKey: ['incident-events', tenantId, incidentId, ownStatusOnly, page], queryFn: () => listIncidentEvents(tenantId, incidentId, page, ownStatusOnly), enabled: open })
  const totalPages = Math.ceil((history.data?.totalCount ?? 0) / INCIDENT_HISTORY_PAGE_SIZE)
  return <details className="incident-history" onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open)}>
    <summary>Report history{history.data ? ` (${history.data.totalCount})` : ''}</summary>
    {history.isPending && open && <LoadingNotice compact />}
    {history.error && <ErrorNotice message="Unable to load this report history." onRetry={() => void history.refetch()} retrying={history.isFetching} />}
    {history.data?.totalCount === 0 && <p>No history entries yet.</p>}
    {history.data?.rows.length ? <ol>{history.data.rows.map((item) => <li key={item.id}><strong>{item.action === 'response_update' ? 'Response update' : item.action.replace('_', ' ')}</strong><span>{formatDateTime(item.created_at)}</span>{item.note && <p>{item.note}</p>}</li>)}</ol> : null}
    {totalPages > 1 && <div className="ops-form-actions"><span className="muted">Page {page + 1} of {totalPages}</span><div className="finance-review-actions">
      <button className="button outline" disabled={page === 0 || history.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button>
      <button className="button outline" disabled={page + 1 >= totalPages || history.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button>
    </div></div>}
  </details>
}

export function IncidentsPage({ focusId, focusAssignedActive, focusOpenReports, onFocusHandled }: { focusId?: string; focusAssignedActive?: boolean; focusOpenReports?: boolean; onFocusHandled?: () => void }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canCreate = useQuery({ queryKey: ['permission', tenantId, 'incident.create'], queryFn: () => hasPermission(tenantId, 'incident.create'), enabled: Boolean(tenantId) })
  const canReport = useQuery({ queryKey: ['permission', tenantId, 'incident.report'], queryFn: () => hasPermission(tenantId, 'incident.report'), enabled: Boolean(tenantId) })
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'incident.manage'], queryFn: () => hasPermission(tenantId, 'incident.manage'), enabled: Boolean(tenantId) })
  const canSubmit = Boolean(canCreate.data || canReport.data)
  const enabled = Boolean(tenantId && (canSubmit || canManage.data))
  const [page, setPage] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [escalationId, setEscalationId] = useState('')
  const [resolutionRequest, setResolutionRequest] = useState<{ incidentId: string; status: 'resolved' | 'closed' } | null>(null)
  const [focusReadyId, setFocusReadyId] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [activeOnly, setActiveOnly] = useState(false)
  const [createdAfter, setCreatedAfter] = useState('')
  const [createdBefore, setCreatedBefore] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { setPage(0); setStatusFilter('all'); setCategoryFilter('all'); setSeverityFilter('all'); setAssignmentFilter('all'); setActiveOnly(false); setSearch(''); setDebouncedSearch(''); setCreatedAfter(''); setCreatedBefore('') }, [tenantId])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedSearch(search.trim().slice(0, 100)); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [search, statusFilter, categoryFilter, severityFilter, assignmentFilter, activeOnly, createdAfter, createdBefore])
  const validDateRange = !createdAfter || !createdBefore || createdAfter <= createdBefore
  const incidents = useQuery({
    queryKey: ['incidents', tenantId, page, debouncedSearch, statusFilter, categoryFilter, severityFilter, assignmentFilter, activeOnly, createdAfter, createdBefore],
    queryFn: () => listIncidents({ tenantId, page, search: debouncedSearch, status: statusFilter, category: categoryFilter, severity: severityFilter, assignmentFilter, activeOnly, createdAfter: getManilaDateBoundary(createdAfter), createdBefore: getManilaDateBoundary(createdBefore, 1) }),
    enabled: enabled && validDateRange,
  })
  const summary = useQuery({ queryKey: ['incident-summary', tenantId, user?.id, createdAfter, createdBefore], queryFn: () => listIncidentSummary(tenantId, user?.id ?? '', getManilaDateBoundary(createdAfter), getManilaDateBoundary(createdBefore, 1)), enabled: Boolean(enabled && user?.id && validDateRange) })
  const breakdown = useQuery({ queryKey: ['incident-breakdown', tenantId, createdAfter, createdBefore], queryFn: () => listIncidentBreakdown(tenantId, getManilaDateBoundary(createdAfter), getManilaDateBoundary(createdBefore, 1)), enabled: Boolean(canManage.data && validDateRange) })
  const ownStatusOnly = Boolean(canReport.data && !canCreate.data && !canManage.data)
  const incidentIds = incidents.data?.rows.map((incident) => incident.id) ?? []
  const evidence = useQuery({ queryKey: ['incident-evidence', tenantId, incidentIds], queryFn: () => listIncidentEvidence(tenantId, incidentIds), enabled: Boolean(tenantId && incidents.data && (canCreate.data || canManage.data)) })
  const totalPages = Math.ceil((incidents.data?.totalCount ?? 0) / INCIDENT_PAGE_SIZE)

  useEffect(() => {
    if (!focusId || !tenantId || !enabled) return
    let cancelled = false
    setSearch(''); setDebouncedSearch(''); setStatusFilter('all'); setCategoryFilter('all'); setSeverityFilter('all'); setAssignmentFilter('all'); setActiveOnly(false)
    setCreatedAfter(''); setCreatedBefore(''); setPage(0); setFocusReadyId('')
    void findVisibleIncidentPage(tenantId, focusId).then((targetPage) => {
      if (cancelled) return
      if (targetPage === null) { onFocusHandled?.(); return }
      setPage(targetPage)
      setFocusReadyId(focusId)
    }).catch(() => { if (!cancelled) onFocusHandled?.() })
    return () => { cancelled = true }
  }, [enabled, focusId, onFocusHandled, tenantId])
  useEffect(() => {
    if (!focusAssignedActive || !tenantId || !enabled) return
    setPage(0); setSearch(''); setDebouncedSearch(''); setStatusFilter('all'); setCategoryFilter('all'); setSeverityFilter('all'); setAssignmentFilter('mine'); setActiveOnly(true); setCreatedAfter(''); setCreatedBefore('')
    window.requestAnimationFrame(() => document.getElementById('incident-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    onFocusHandled?.()
  }, [enabled, focusAssignedActive, onFocusHandled, tenantId])
  useEffect(() => {
    if (!focusOpenReports || !tenantId || !enabled || canManage.data) return
    setPage(0); setSearch(''); setDebouncedSearch(''); setStatusFilter('all'); setCategoryFilter('all'); setSeverityFilter('all'); setAssignmentFilter('all'); setActiveOnly(true); setCreatedAfter(''); setCreatedBefore('')
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('incident-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      onFocusHandled?.()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [canManage.data, enabled, focusOpenReports, onFocusHandled, tenantId])

  useEffect(() => {
    if (!focusId || focusReadyId !== focusId || !incidents.data?.rows.some((incident) => incident.id === focusId)) return
    const target = document.getElementById(`incident-card-${focusId}`)
    if (!target) return
    target.focus({ preventScroll: true }); target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    onFocusHandled?.()
  }, [focusId, focusReadyId, incidents.data, onFocusHandled])

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['incidents', tenantId] }), queryClient.invalidateQueries({ queryKey: ['incident-summary', tenantId] }), queryClient.invalidateQueries({ queryKey: ['incident-breakdown', tenantId] }), queryClient.invalidateQueries({ queryKey: ['incident-events', tenantId] }), queryClient.invalidateQueries({ queryKey: ['incident-evidence', tenantId] })])
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = incidentSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the report details.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await submitIncident({ tenantId, ...parsed.data })
      setPage(0); setSearch(''); setStatusFilter('all'); setCategoryFilter('all'); setSeverityFilter('all'); setAssignmentFilter('all'); setActiveOnly(false); setCreatedAfter(''); setCreatedBefore('')
      await refresh(); form.reset(); setShowForm(false); setMessage('Incident report submitted.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit the report.') }
    finally { setBusy(false) }
  }

  async function advance(id: string, status: string) {
    const needsNote = status === 'resolved' || status === 'closed'
    if (needsNote) { setResolutionRequest({ incidentId: id, status }); return }
    setBusy(true); setError(''); setMessage('')
    try { await transitionIncident(id, status); await refresh(); setMessage(`Incident marked ${statusLabels[status].toLowerCase()}.`) }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to update this incident.') }
    finally { setBusy(false) }
  }

  async function resolveWithNote(note: string) {
    if (!resolutionRequest) return
    setBusy(true); setError(''); setMessage('')
    try {
      await transitionIncident(resolutionRequest.incidentId, resolutionRequest.status, note)
      await refresh()
      setResolutionRequest(null)
      setMessage(`Incident marked ${statusLabels[resolutionRequest.status].toLowerCase()}.`)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Unable to update this incident.')
    } finally { setBusy(false) }
  }

  async function assign(id: string, tanodId: string) {
    if (!tanodId) return
    setBusy(true); setError(''); setMessage('')
    try { await assignIncident(id, tanodId); await refresh(); setMessage('Incident assigned to a Tanod.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to assign this incident.') }
    finally { setBusy(false) }
  }

  async function escalate(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = escalationSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the handoff record.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await escalateIncident(id, parsed.data.destination, parsed.data.note); await refresh(); form.reset(); setEscalationId(''); setMessage('Verified external handoff recorded in the incident history.') }
    catch { setError('Unable to record the escalation. Confirm the handoff happened and review the details.') }
    finally { setBusy(false) }
  }

  async function addUpdate(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const note = String(new FormData(form).get('note') ?? '').trim()
    if (note.length < 3 || note.length > 1000) { setError('Response updates must be between 3 and 1000 characters.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await addIncidentUpdate(id, note); await refresh(); form.reset(); setMessage('Response update added to the report history.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to add the response update.') }
    finally { setBusy(false) }
  }

  async function attachEvidence(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = (form.elements.namedItem('evidence') as HTMLInputElement | null)?.files?.[0]
    if (!file) { setError('Choose a PDF, JPEG, or PNG file up to 10 MB.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await uploadIncidentEvidence(id, file); await refresh(); form.reset(); setMessage('Private evidence attached to the incident.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to attach evidence.') }
    finally { setBusy(false) }
  }

  async function openEvidence(path: string) {
    setError('')
    try {
      const url = await createIncidentEvidenceDownloadUrl(path)
      const link = document.createElement('a')
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click()
    } catch { setError('Unable to open this evidence file. Your access may have changed.') }
  }

  async function exportIncidents() {
    setExportBusy(true); setError(''); setMessage('')
    try {
      const rows = [] as Awaited<ReturnType<typeof listIncidents>>['rows']
      let totalCount = 0
      const exportPageSize = 100
      for (let exportPage = 0; exportPage === 0 || rows.length < totalCount; exportPage += 1) {
        const result = await listIncidents({ tenantId, page: exportPage, pageSize: exportPageSize, search: debouncedSearch, status: statusFilter, category: categoryFilter, severity: severityFilter, assignmentFilter, activeOnly, createdAfter: getManilaDateBoundary(createdAfter), createdBefore: getManilaDateBoundary(createdBefore, 1) })
        rows.push(...result.rows)
        totalCount = result.totalCount
        if (result.rows.length === 0) break
      }
      const columns = ['Reported at', 'Category', 'Severity', 'Location', 'Summary', 'Status', 'Assignment']
      const csvCell = (value: string) => {
        const safeValue = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value
        return `"${safeValue.replaceAll('"', '""')}"`
      }
      const lines = [columns, ...rows.map((row) => [row.created_at, row.category, row.severity, row.location, row.summary, row.status, row.assigned_to ? 'Assigned' : 'Unassigned'])]
      const blob = new Blob(['\uFEFF', lines.map((line) => line.map((value) => csvCell(value)).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `kabalikat-incident-queue-${getManilaDateInputValue()}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      setMessage(`Downloaded ${rows.length} incident ${rows.length === 1 ? 'report' : 'reports'}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export the incident queue.')
    } finally { setExportBusy(false) }
  }

  const visibleIncidents = incidents.data?.rows ?? []
  const hasFilters = Boolean(debouncedSearch || statusFilter !== 'all' || categoryFilter !== 'all' || severityFilter !== 'all' || assignmentFilter !== 'all' || activeOnly || createdAfter || createdBefore)

  return <section className="operation-page">
    <PageHeading title="Incident reports" description={canReport.data && !canCreate.data ? 'Submit a local safety report and track its status.' : 'Record local safety and hazard reports and track official follow-up.'}>
      {canSubmit && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}>Report an incident</button>}
    </PageHeading>
    <div className="ops-panel incident-guidance"><AlertTriangle size={19} /><p><strong>Immediate danger?</strong> Contact the appropriate emergency services directly. Submitting a report here does not contact responders. Avoid entering names, medical details, or other unnecessary personal information.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view or submit incident reports." />}
    {Boolean(tenantId) && (canCreate.isPending || canReport.isPending || canManage.isPending) && <LoadingNotice compact />}
    {(canCreate.error || canReport.error || canManage.error) && <ErrorNotice message="Your incident workspace access could not be checked. Refresh the page or contact your barangay administrator." onRetry={() => { void canCreate.refetch(); void canReport.refetch(); void canManage.refetch() }} retrying={canCreate.isFetching || canReport.isFetching || canManage.isFetching} />}
    {Boolean(tenantId) && !canCreate.isPending && !canReport.isPending && !canManage.isPending && !canCreate.error && !canReport.error && !canManage.error && !enabled && <EmptyNotice title="Incident workspace access is not enabled" detail="Ask your barangay administrator for incident reporting or management access if you need this workspace." />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {summary.error && <ErrorNotice message="Incident reports are available, but the workload summary could not be loaded." onRetry={() => void summary.refetch()} retrying={summary.isFetching} />}
    {summary.data && <div className="incident-summary" aria-label="Incident workload summary"><div><strong>{summary.data.openCount}</strong><span>Open reports</span></div><div><strong>{summary.data.urgentOpenCount}</strong><span>High or urgent</span></div><div><strong>{canReport.data && !canCreate.data ? summary.data.myOpenCount : summary.data.assignedToMeCount}</strong><span>{canReport.data && !canCreate.data ? 'Your open reports' : 'Assigned to you'}</span></div></div>}
    {canManage.data && breakdown.data && <section className="ops-panel incident-breakdown" aria-label="Incident queue overview"><div><h2>Queue overview</h2><p>Counts follow the selected report date range. Select a status or category to filter the queue.</p></div><button type="button" className="incident-unassigned-summary" aria-label="Show active reports without an assignee" aria-pressed={assignmentFilter === 'unassigned' && activeOnly} onClick={() => { const selected = assignmentFilter === 'unassigned' && activeOnly; setAssignmentFilter(selected ? 'all' : 'unassigned'); setActiveOnly(!selected); setStatusFilter('all'); setPage(0) }}><span>Active reports without an assignee</span><strong>{breakdown.data.find((item) => item.metric_type === 'assignment' && item.metric_value === 'unassigned_active')?.report_count ?? 0}</strong><small>Submitted, acknowledged, or in progress · Select to review</small></button><div className="incident-breakdown-groups"><div><h3>By status</h3><ul>{breakdown.data.filter((item) => item.metric_type === 'status').map((item) => <li key={item.metric_value}><button type="button" className="incident-status-shortcut" aria-pressed={statusFilter === item.metric_value && !activeOnly} onClick={() => { setStatusFilter((current) => current === item.metric_value && !activeOnly ? 'all' : item.metric_value); setActiveOnly(false); setPage(0) }}><span>{statusLabels[item.metric_value] ?? item.metric_value}</span><strong>{item.report_count}</strong></button></li>)}</ul></div><div><h3>By category</h3><ul>{breakdown.data.filter((item) => item.metric_type === 'category').map((item) => <li key={item.metric_value}><button type="button" className="incident-status-shortcut" aria-pressed={categoryFilter === item.metric_value} onClick={() => { setCategoryFilter((current) => current === item.metric_value ? 'all' : item.metric_value); setPage(0) }}><span>{item.metric_value}</span><strong>{item.report_count}</strong></button></li>)}</ul></div></div></section>}
    {showForm && canSubmit && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>New incident report</h2><p>Share only the minimum details needed to respond. Do not include names or medical information.</p></div><Siren size={19} /></div><div className="ops-form-grid">
      <label>Category<select name="category"><option value="safety">Safety concern</option><option value="hazard">Hazard</option><option value="disturbance">Disturbance</option><option value="property">Property issue</option><option value="disaster">Disaster</option><option value="other">Other</option></select></label>
      <label>Severity<select name="severity"><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      <label className="span-two">Location<input name="location" minLength={2} maxLength={240} placeholder="Area, street, or landmark" required /></label>
      <label className="span-two">Short summary<input name="summary" minLength={3} maxLength={180} required /></label>
      <label className="span-two">Details<textarea name="details" maxLength={3000} rows={4} /></label>
    </div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Submit report</button></div></form>}
    {incidents.isPending && enabled && validDateRange && <LoadingNotice />}{incidents.error && <ErrorNotice message={incidents.error.message} onRetry={() => void incidents.refetch()} retrying={incidents.isFetching} />}
    {enabled && <div className="incident-filters"><label>Search<input aria-label="Search incident reports" placeholder="Summary, location, or details" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setActiveOnly(false); setPage(0) }}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Category<select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(0) }}><option value="all">All categories</option>{['safety','hazard','disturbance','property','disaster','other'].map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Severity<select value={severityFilter} onChange={(event) => { setSeverityFilter(event.target.value); setPage(0) }}><option value="all">All severities</option>{['urgent','high','moderate','low'].map((severity) => <option key={severity} value={severity}>{severity[0].toUpperCase() + severity.slice(1)}</option>)}</select></label><div className="incident-date-filter"><label htmlFor="incident-reported-after">Reported on or after</label><input id="incident-reported-after" type="date" value={createdAfter} max={createdBefore || undefined} onChange={(event) => { setCreatedAfter(event.target.value); setPage(0) }} /></div><div className="incident-date-filter"><label htmlFor="incident-reported-before">Reported on or before</label><input id="incident-reported-before" type="date" value={createdBefore} min={createdAfter || undefined} onChange={(event) => { setCreatedBefore(event.target.value); setPage(0) }} /></div>{(createdAfter || createdBefore) && <button type="button" className="button outline" onClick={() => { setCreatedAfter(''); setCreatedBefore(''); setPage(0) }}>Clear dates</button>}{canManage.data && <button type="button" className="button outline incident-export-button" disabled={exportBusy || !validDateRange} onClick={() => void exportIncidents()}><FileDown size={16} />{exportBusy ? 'Preparing export…' : 'Export filtered queue'}</button>}</div>}
    {enabled && (canCreate.data || canManage.data) && <div className="incident-assignment-filters" role="group" aria-label="Filter incident assignment">
      <button type="button" className={`button ${assignmentFilter === 'all' ? 'primary' : 'outline'}`} aria-pressed={assignmentFilter === 'all'} onClick={() => { setAssignmentFilter('all'); setPage(0) }}>All reports</button>
      <button type="button" className={`button ${assignmentFilter === 'mine' ? 'primary' : 'outline'}`} aria-pressed={assignmentFilter === 'mine'} onClick={() => { setAssignmentFilter((value) => value === 'mine' ? 'all' : 'mine'); setPage(0) }}>Assigned to me</button>
      {canManage.data && <button type="button" className={`button ${assignmentFilter === 'unassigned' ? 'primary' : 'outline'}`} aria-pressed={assignmentFilter === 'unassigned'} onClick={() => { setAssignmentFilter((value) => value === 'unassigned' ? 'all' : 'unassigned'); setPage(0) }}>Unassigned reports</button>}
      {canManage.data && <button type="button" className={`button ${activeOnly ? 'primary' : 'outline'}`} aria-pressed={activeOnly} onClick={() => { const nextActiveOnly = !activeOnly; setActiveOnly(nextActiveOnly); if (nextActiveOnly) setStatusFilter('all'); setPage(0) }}>Needs attention</button>}
    </div>}
    {!validDateRange && <p className="muted" role="alert">The start date must be on or before the end date.</p>}
    {incidents.data?.totalCount === 0 && <div className="ops-empty"><Siren size={22} /><strong>{hasFilters ? 'No matching reports' : 'No incident reports'}</strong><p>{hasFilters ? 'Adjust the search or filters to see other reports.' : 'Reports you submit or are authorized to manage appear here.'}</p></div>}
    <div className="incident-list" id="incident-list">{visibleIncidents.map((incident) => <article id={`incident-card-${incident.id}`} tabIndex={-1} className="ops-panel incident-card" key={incident.id}>
      <header><div><StatusPill status={incident.status} /><h2>{incident.summary}</h2></div><span className={`incident-severity severity-${incident.severity}`}>{incident.severity}</span></header>
      <div className="incident-meta"><span>{incident.category}</span><span>{incident.location}</span><span>{formatDateTime(incident.created_at)}</span></div>
      {incident.details && <details className="incident-report-details"><summary>View report details</summary><p className="incident-details">{incident.details}</p></details>}
      {(canManage.data || incident.assigned_to === user?.id) && <section className="incident-evidence"><h3><Paperclip size={15} /> Private evidence <span>{evidence.data?.filter((item) => item.incident_id === incident.id).length ?? 0}</span></h3><p>Visible only to the barangay Captain and Tanod assigned to this report. PDF, JPEG, or PNG up to 10 MB.</p>{evidence.data?.filter((item) => item.incident_id === incident.id).map((item) => <button className="incident-evidence-file" key={item.id} onClick={() => void openEvidence(item.storage_path)}><Download size={14} /><span>{item.file_name}<small>{(Number(item.file_size) / 1024).toFixed(0)} KB · {formatDateTime(item.created_at)}</small></span></button>)}{incident.status !== 'closed' && <form className="incident-evidence-upload" onSubmit={(event) => void attachEvidence(incident.id, event)}><label>Attach evidence<input name="evidence" type="file" accept="application/pdf,image/jpeg,image/png" required /></label><button className="button outline" disabled={busy}>Upload file</button></form>}</section>}
      {incident.resolution_note && <p className="finance-review-note">Resolution: {incident.resolution_note}</p>}
      {incident.assigned_to && <p className="incident-assigned">Assigned to {incident.assigned_to === user?.id ? 'you' : 'a Tanod'}</p>}
      {canManage.data && ['submitted','acknowledged','in_progress'].includes(incident.status) && <div className="incident-assign"><span>Assign or reassign to a Tanod</span><TanodPicker tenantId={tenantId} permission="incident.manage" selectedId={incident.assigned_to ?? ''} disabled={busy} label={`Tanod for ${incident.summary}`} onChange={(id) => void assign(incident.id, id)} /> </div>}
      {(canManage.data || incident.assigned_to === user?.id) && <div className="finance-review-actions">{incident.status === 'submitted' && <button className="button primary" disabled={busy} onClick={() => void advance(incident.id, 'acknowledged')}>Acknowledge</button>}{incident.status === 'acknowledged' && <button className="button primary" disabled={busy} onClick={() => void advance(incident.id, 'in_progress')}>Start response</button>}{canManage.data && incident.status === 'in_progress' && <button className="button primary" disabled={busy} onClick={() => void advance(incident.id, 'resolved')}>Resolve with note</button>}{canManage.data && ['submitted','acknowledged','in_progress'].includes(incident.status) && <button className="button outline" disabled={busy} onClick={() => setEscalationId((current) => current === incident.id ? '' : incident.id)}><Upload size={15} />Record external handoff</button>}{canManage.data && incident.status === 'resolved' && <button className="button outline" disabled={busy} onClick={() => void advance(incident.id, 'closed')}>Close report</button>}</div>}
      {canManage.data && escalationId === incident.id && <form className="incident-update-form" onSubmit={(event) => void escalate(incident.id, event)}><label>Receiving agency or responder<input name="destination" minLength={3} maxLength={180} required placeholder="Who accepted the handoff?" /></label><label>Handoff details<textarea name="note" minLength={3} maxLength={1000} rows={2} required placeholder="Record when and how the handoff was completed." /></label><label className="referral-confirm"><input name="confirm" type="checkbox" value="yes" required /><span>I confirm the external handoff already happened. KABALIKAT did not contact them.</span></label><button className="button primary" disabled={busy}>Record verified handoff</button></form>}
      {(canManage.data || incident.assigned_to === user?.id) && ['acknowledged','in_progress'].includes(incident.status) && <form className="incident-update-form" onSubmit={(event) => void addUpdate(incident.id, event)}><label>Add a response update<textarea name="note" minLength={3} maxLength={1000} rows={2} required placeholder="Record an action taken or a handoff." /></label><button className="button outline" disabled={busy}>Add update</button></form>}
      <IncidentHistory tenantId={tenantId} incidentId={incident.id} ownStatusOnly={ownStatusOnly} />
    </article>)}</div>
    {totalPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="Incident report pages">
      <span className="muted">Page {page + 1} of {totalPages} - {incidents.data?.totalCount ?? 0} reports</span>
      <div className="finance-review-actions">
        <button className="button outline" disabled={page === 0 || incidents.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button>
        <button className="button outline" disabled={page + 1 >= totalPages || incidents.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button>
      </div>
    </nav>}
    {resolutionRequest && <IncidentResolutionDialog status={resolutionRequest.status} busy={busy} onCancel={() => { if (!busy) setResolutionRequest(null) }} onConfirm={resolveWithNote} />}
  </section>
}
