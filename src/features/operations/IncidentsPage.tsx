import { useEffect, useState, type FormEvent, type SyntheticEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, Paperclip, Siren, Upload } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { addIncidentUpdate, assignIncident, createIncidentEvidenceDownloadUrl, escalateIncident, INCIDENT_HISTORY_PAGE_SIZE, INCIDENT_PAGE_SIZE, listIncidentAssignees, listIncidentEvents, listIncidentEvidence, listIncidents, listIncidentSummary, submitIncident, transitionIncident, uploadIncidentEvidence } from './incident-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

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
    {history.error && <ErrorNotice message="Unable to load this report history." />}
    {history.data?.totalCount === 0 && <p>No history entries yet.</p>}
    {history.data?.rows.length ? <ol>{history.data.rows.map((item) => <li key={item.id}><strong>{item.action === 'response_update' ? 'Response update' : item.action.replace('_', ' ')}</strong><span>{formatDateTime(item.created_at)}</span>{item.note && <p>{item.note}</p>}</li>)}</ol> : null}
    {totalPages > 1 && <div className="ops-form-actions"><span className="muted">Page {page + 1} of {totalPages}</span><div className="finance-review-actions">
      <button className="button outline" disabled={page === 0 || history.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />Previous</button>
      <button className="button outline" disabled={page + 1 >= totalPages || history.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={16} /></button>
    </div></div>}
  </details>
}

export function IncidentsPage() {
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
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => setPage(0), [tenantId])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedSearch(search.trim().slice(0, 100)); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [search, statusFilter, categoryFilter])
  const incidents = useQuery({
    queryKey: ['incidents', tenantId, page, debouncedSearch, statusFilter, categoryFilter],
    queryFn: () => listIncidents({ tenantId, page, search: debouncedSearch, status: statusFilter, category: categoryFilter }),
    enabled,
  })
  const summary = useQuery({ queryKey: ['incident-summary', tenantId, user?.id], queryFn: () => listIncidentSummary(tenantId, user?.id ?? ''), enabled: Boolean(enabled && user?.id) })
  const ownStatusOnly = Boolean(canReport.data && !canCreate.data && !canManage.data)
  const incidentIds = incidents.data?.rows.map((incident) => incident.id) ?? []
  const evidence = useQuery({ queryKey: ['incident-evidence', tenantId, incidentIds], queryFn: () => listIncidentEvidence(tenantId, incidentIds), enabled: Boolean(tenantId && incidents.data && (canCreate.data || canManage.data)) })
  const assignees = useQuery({ queryKey: ['incident-assignees', tenantId], queryFn: () => listIncidentAssignees(tenantId), enabled: Boolean(tenantId && canManage.data) })
  const totalPages = Math.ceil((incidents.data?.totalCount ?? 0) / INCIDENT_PAGE_SIZE)

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['incidents', tenantId] }), queryClient.invalidateQueries({ queryKey: ['incident-summary', tenantId] }), queryClient.invalidateQueries({ queryKey: ['incident-events', tenantId] }), queryClient.invalidateQueries({ queryKey: ['incident-evidence', tenantId] })])
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = incidentSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the report details.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await submitIncident({ tenantId, ...parsed.data })
      setPage(0); setSearch(''); setStatusFilter('all'); setCategoryFilter('all')
      await refresh(); form.reset(); setShowForm(false); setMessage('Incident report submitted.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit the report.') }
    finally { setBusy(false) }
  }

  async function advance(id: string, status: string) {
    const needsNote = status === 'resolved' || status === 'closed'
    const note = needsNote ? window.prompt('Add a short resolution note:') ?? '' : ''
    if (needsNote && note.trim().length < 3) return
    setBusy(true); setError(''); setMessage('')
    try { await transitionIncident(id, status, note); await refresh(); setMessage(`Incident marked ${statusLabels[status].toLowerCase()}.`) }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to update this incident.') }
    finally { setBusy(false) }
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

  const visibleIncidents = incidents.data?.rows ?? []
  const hasFilters = Boolean(debouncedSearch || statusFilter !== 'all' || categoryFilter !== 'all')

  return <section className="operation-page">
    <PageHeading title="Incident reports" description={canReport.data && !canCreate.data ? 'Submit a local safety report and track its status.' : 'Record local safety and hazard reports and track official follow-up.'}>
      {canSubmit && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}>Report an incident</button>}
    </PageHeading>
    <div className="ops-panel incident-guidance"><AlertTriangle size={19} /><p><strong>Immediate danger?</strong> Contact the appropriate emergency services directly. Submitting a report here does not contact responders. Avoid entering names, medical details, or other unnecessary personal information.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view or submit incident reports." />}
    {Boolean(tenantId) && (canCreate.isPending || canReport.isPending || canManage.isPending) && <LoadingNotice compact />}
    {(canCreate.error || canReport.error || canManage.error) && <ErrorNotice message="Your incident workspace access could not be checked. Refresh the page or contact your barangay administrator." />}
    {Boolean(tenantId) && !canCreate.isPending && !canReport.isPending && !canManage.isPending && !canCreate.error && !canReport.error && !canManage.error && !enabled && <EmptyNotice title="Incident workspace access is not enabled" detail="Ask your barangay administrator for incident reporting or management access if you need this workspace." />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {summary.error && <ErrorNotice message="Incident reports are available, but the workload summary could not be loaded." />}
    {summary.data && <div className="incident-summary" aria-label="Incident workload summary"><div><strong>{summary.data.openCount}</strong><span>Open reports</span></div><div><strong>{summary.data.urgentOpenCount}</strong><span>High or urgent</span></div><div><strong>{canReport.data && !canCreate.data ? summary.data.myOpenCount : summary.data.assignedToMeCount}</strong><span>{canReport.data && !canCreate.data ? 'Your open reports' : 'Assigned to you'}</span></div></div>}
    {showForm && canSubmit && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>New incident report</h2><p>Share only the minimum details needed to respond. Do not include names or medical information.</p></div><Siren size={19} /></div><div className="ops-form-grid">
      <label>Category<select name="category"><option value="safety">Safety concern</option><option value="hazard">Hazard</option><option value="disturbance">Disturbance</option><option value="property">Property issue</option><option value="disaster">Disaster</option><option value="other">Other</option></select></label>
      <label>Severity<select name="severity"><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      <label className="span-two">Location<input name="location" minLength={2} maxLength={240} placeholder="Area, street, or landmark" required /></label>
      <label className="span-two">Short summary<input name="summary" minLength={3} maxLength={180} required /></label>
      <label className="span-two">Details<textarea name="details" maxLength={3000} rows={4} /></label>
    </div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Submit report</button></div></form>}
    {incidents.isPending && enabled && <LoadingNotice />}{incidents.error && <ErrorNotice message={incidents.error.message} />}
    {Boolean(incidents.data && (incidents.data.totalCount > 0 || hasFilters)) && <div className="incident-filters"><label>Search<input aria-label="Search incident reports" placeholder="Summary, location, or details" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0) }}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Category<select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(0) }}><option value="all">All categories</option>{['safety','hazard','disturbance','property','disaster','other'].map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div>}
    {incidents.data?.totalCount === 0 && <div className="ops-empty"><Siren size={22} /><strong>{hasFilters ? 'No matching reports' : 'No incident reports'}</strong><p>{hasFilters ? 'Adjust the search or filters to see other reports.' : 'Reports you submit or are authorized to manage appear here.'}</p></div>}
    <div className="incident-list">{visibleIncidents.map((incident) => <article className="ops-panel incident-card" key={incident.id}>
      <header><div><StatusPill status={incident.status} /><h2>{incident.summary}</h2></div><span className={`incident-severity severity-${incident.severity}`}>{incident.severity}</span></header>
      <div className="incident-meta"><span>{incident.category}</span><span>{incident.location}</span><span>{formatDateTime(incident.created_at)}</span></div>
      {incident.details && <p className="incident-details">{incident.details}</p>}
      {(canManage.data || incident.assigned_to === user?.id) && <section className="incident-evidence"><h3><Paperclip size={15} /> Private evidence <span>{evidence.data?.filter((item) => item.incident_id === incident.id).length ?? 0}</span></h3><p>Visible only to the barangay Captain and Tanod assigned to this report. PDF, JPEG, or PNG up to 10 MB.</p>{evidence.data?.filter((item) => item.incident_id === incident.id).map((item) => <button className="incident-evidence-file" key={item.id} onClick={() => void openEvidence(item.storage_path)}><Download size={14} /><span>{item.file_name}<small>{(Number(item.file_size) / 1024).toFixed(0)} KB · {formatDateTime(item.created_at)}</small></span></button>)}{incident.status !== 'closed' && <form className="incident-evidence-upload" onSubmit={(event) => void attachEvidence(incident.id, event)}><label>Attach evidence<input name="evidence" type="file" accept="application/pdf,image/jpeg,image/png" required /></label><button className="button outline" disabled={busy}>Upload file</button></form>}</section>}
      {incident.resolution_note && <p className="finance-review-note">Resolution: {incident.resolution_note}</p>}
      {incident.assigned_to && <p className="incident-assigned">Assigned to {incident.assigned_to === user?.id ? 'you' : assignees.data?.find((member) => member.user_id === incident.assigned_to)?.display_name ?? 'a Tanod'}</p>}
      {canManage.data && ['submitted','acknowledged','in_progress'].includes(incident.status) && <label className="incident-assign">Assign or reassign to a Tanod<select aria-label={`Assign ${incident.summary}`} value={incident.assigned_to ?? ''} disabled={busy || assignees.isPending} onChange={(event) => void assign(incident.id, event.target.value)}><option value="">Select an active Tanod</option>{assignees.data?.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}</select></label>}
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
  </section>
}
