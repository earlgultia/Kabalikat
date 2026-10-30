import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { AlertTriangle, CheckCircle2, ExternalLink, MapPin, Megaphone, Phone, Plus, Printer, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { archiveDisasterEmergencyResource, createDisasterAdvisory, listDisasterAdvisoryPage, listDisasterAdvisoryEvents, listDisasterEmergencyResourceActivity, listDisasterEmergencyResources, publishDisasterAdvisory, publishDisasterEmergencyResource, resolveDisasterAdvisory, saveDisasterEmergencyResource, type DisasterAdvisory, type DisasterEmergencyResource, DISASTER_ADVISORY_PAGE_SIZE } from './disaster-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const advisorySchema = z.object({ type: z.enum(['weather','flood','fire','earthquake','landslide','health','other']), severity: z.enum(['information','watch','warning','emergency']), title: z.string().trim().min(3).max(180), area: z.string().trim().min(2).max(240), instructions: z.string().trim().min(3).max(4000), expiry: z.string() })
const resourceSchema = z.object({ type: z.enum(['emergency_contact','evacuation_center']), name: z.string().trim().min(2).max(120), phone: z.string().trim().max(40), address: z.string().trim().max(250), details: z.string().trim().max(1000) }).superRefine((value, context) => {
  if (value.type === 'emergency_contact' && value.phone.length < 5) context.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a phone number or hotline with at least 5 characters.' })
  if (value.type === 'evacuation_center' && value.address.length < 3) context.addIssue({ code: 'custom', path: ['address'], message: 'Enter the evacuation center address.' })
})

export function DisasterAdvisoriesPage() {
  const { membership } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'disaster.manage'], queryFn: () => hasPermission(tenantId, 'disaster.manage'), enabled: Boolean(tenantId) })
  const canRead = useQuery({ queryKey: ['permission', tenantId, 'disaster.read'], queryFn: () => hasPermission(tenantId, 'disaster.read'), enabled: Boolean(tenantId) })
  const enabled = Boolean(tenantId && (canManage.data || canRead.data))
  const [page, setPage] = useState(0)
  const [advisorySearch, setAdvisorySearch] = useState('')
  const [advisorySeverityFilter, setAdvisorySeverityFilter] = useState<'all' | DisasterAdvisory['severity']>('all')
  const [advisoryStatusFilter, setAdvisoryStatusFilter] = useState<'all' | DisasterAdvisory['status']>('all')
  const [debouncedAdvisorySearch, setDebouncedAdvisorySearch] = useState('')
  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedAdvisorySearch(advisorySearch); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [advisorySearch])
  const advisories = useQuery({
    queryKey: ['disaster-advisories', tenantId, page, debouncedAdvisorySearch, advisorySeverityFilter, canManage.data ? advisoryStatusFilter : 'all'],
    queryFn: () => listDisasterAdvisoryPage(tenantId, page, debouncedAdvisorySearch, advisorySeverityFilter, canManage.data ? advisoryStatusFilter : 'all'),
    enabled,
  })
  const advisoryIds = advisories.data?.advisories.map((item) => item.id) ?? []
  const events = useQuery({
    queryKey: ['disaster-advisory-events', tenantId, advisoryIds],
    queryFn: () => listDisasterAdvisoryEvents(tenantId, advisoryIds),
    enabled: Boolean(tenantId && canManage.data && advisoryIds.length),
  })
  const resources = useQuery({ queryKey: ['disaster-emergency-resources', tenantId], queryFn: () => listDisasterEmergencyResources(tenantId), enabled })
  const resourceActivity = useQuery({ queryKey: ['disaster-emergency-resource-activity', tenantId], queryFn: () => listDisasterEmergencyResourceActivity(tenantId), enabled: Boolean(tenantId && canManage.data) })
  const [showForm, setShowForm] = useState(false)
  const [showResourceForm, setShowResourceForm] = useState(false)
  const [editingResource, setEditingResource] = useState<DisasterEmergencyResource | null>(null)
  const [resourceTypeFilter, setResourceTypeFilter] = useState<'all' | DisasterEmergencyResource['resource_type']>('all')
  const [resourceStatusFilter, setResourceStatusFilter] = useState<'all' | DisasterEmergencyResource['status']>('all')
  const [resourceSearch, setResourceSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['disaster-advisories', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['disaster-advisory-events', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['disaster-emergency-resources', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['disaster-emergency-resource-activity', tenantId] }),
    ])
  }

  const visibleResources = (resources.data ?? []).filter((resource) => {
    const term = resourceSearch.trim().toLocaleLowerCase()
    const matchesType = resourceTypeFilter === 'all' || resource.resource_type === resourceTypeFilter
    const matchesStatus = resourceStatusFilter === 'all' || resource.status === resourceStatusFilter
    const matchesSearch = !term || [resource.name, resource.phone, resource.address, resource.details].some((value) => value?.toLocaleLowerCase().includes(term))
    return matchesType && matchesStatus && matchesSearch
  })
  const visibleAdvisories = advisories.data?.advisories ?? []

  async function saveResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = resourceSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the emergency resource details.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await saveDisasterEmergencyResource({ tenantId, resourceId: editingResource?.id ?? null, resourceType: parsed.data.type, name: parsed.data.name, phone: parsed.data.phone, address: parsed.data.address, details: parsed.data.details })
      await refresh(); form.reset(); setShowResourceForm(false); setEditingResource(null); setMessage(editingResource ? 'Emergency resource draft updated.' : 'Emergency resource saved as a draft. Review it before publishing.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save this emergency resource.') }
    finally { setBusy(false) }
  }

  function editResource(resource: DisasterEmergencyResource) {
    setEditingResource(resource)
    setShowResourceForm(true)
    requestAnimationFrame(() => document.getElementById('emergency-resource-editor')?.scrollIntoView({ behavior: 'auto', block: 'center' }))
  }

  function printEmergencyDirectory() {
    const cleanup = () => document.body.classList.remove('print-emergency-directory')
    window.addEventListener('afterprint', cleanup, { once: true })
    document.body.classList.add('print-emergency-directory')
    window.print()
  }

  async function publishResource(id: string) {
    if (!window.confirm('Publish this emergency resource to barangay members? Verify the contact details and location first.')) return
    setBusy(true); setError(''); setMessage('')
    try { await publishDisasterEmergencyResource(id); await refresh(); setMessage('Emergency resource published.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to publish this emergency resource.') }
    finally { setBusy(false) }
  }

  async function archiveResource(id: string) {
    if (!window.confirm('Archive this resource? It will no longer appear in the resident directory.')) return
    const note = window.prompt('Optional reason for archiving this resource:')
    if (note === null) return
    if (note.trim().length > 1000) { setError('Archive note cannot exceed 1000 characters.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await archiveDisasterEmergencyResource(id, note); await refresh(); setMessage('Emergency resource archived.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to archive this resource.') }
    finally { setBusy(false) }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = advisorySchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the advisory.'); return }
    const expiresAt = parsed.data.expiry ? new Date(parsed.data.expiry) : null
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) { setError('Expiry must be a future date and time.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await createDisasterAdvisory({ tenantId, type: parsed.data.type, severity: parsed.data.severity, title: parsed.data.title, area: parsed.data.area, instructions: parsed.data.instructions, expiresAt: expiresAt?.toISOString() ?? null }); await refresh(); setPage(0); form.reset(); setShowForm(false); setMessage('Advisory draft saved. Review it before publishing.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to save this advisory.') }
    finally { setBusy(false) }
  }

  async function publish(id: string) {
    if (!window.confirm('Publish this advisory to barangay members?')) return
    setBusy(true); setError(''); setMessage('')
    try { await publishDisasterAdvisory(id); await refresh(); setMessage('Disaster advisory published.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to publish this advisory.') }
    finally { setBusy(false) }
  }

  async function resolve(id: string) {
    const note = window.prompt('Explain why this advisory is resolved:') ?? ''
    if (note.trim().length < 3 || note.trim().length > 1000) return
    setBusy(true); setError(''); setMessage('')
    try { await resolveDisasterAdvisory(id, note); await refresh(); setMessage('Advisory marked resolved.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to resolve this advisory.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Disaster advisories" description="Read local warnings and evacuation instructions from authorized barangay officials.">
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}>New advisory</button>}
    </PageHeading>
    <div className="ops-panel incident-guidance"><AlertTriangle size={19} /><p><strong>Immediate danger?</strong> Contact appropriate emergency services directly. This advisory board does not send alerts or contact responders.</p></div>
    {(canManage.isPending || canRead.isPending) && <LoadingNotice compact />}
    {(canManage.error || canRead.error) && <ErrorNotice message="Your disaster workspace access could not be checked. Refresh the page or contact your barangay administrator." />}
    {!canManage.isPending && !canRead.isPending && !canManage.error && !canRead.error && !enabled && <EmptyNotice title="Disaster workspace access is not enabled" detail="Ask your barangay administrator for disaster read or management access if you need to view local advisories and emergency resources." />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    <section className="ops-panel emergency-resource-panel">
      <div className="ops-panel-heading"><div><h2>Emergency contacts and evacuation centers</h2><p>Use verified contact details and locations published by your barangay.</p></div><ShieldCheck size={19} /></div>
      <button className="button outline emergency-resource-print-button" disabled={resources.isPending || !resources.data?.some((resource) => resource.status === 'published')} onClick={printEmergencyDirectory}><Printer size={15} />Print published directory</button>
      {canManage.data && <button className="button outline" onClick={() => { setEditingResource(null); setShowResourceForm((visible) => !visible) }}><Plus size={15} />{showResourceForm && !editingResource ? 'Close form' : 'Add emergency resource'}</button>}
      <div className="emergency-resource-filters"><label>Search resources<input value={resourceSearch} onChange={(event) => setResourceSearch(event.target.value)} placeholder="Name, phone, or address" /></label><label>Type<select value={resourceTypeFilter} onChange={(event) => setResourceTypeFilter(event.target.value as typeof resourceTypeFilter)}><option value="all">All resource types</option><option value="emergency_contact">Emergency contacts</option><option value="evacuation_center">Evacuation centers</option></select></label>{canManage.data && <label>Status<select value={resourceStatusFilter} onChange={(event) => setResourceStatusFilter(event.target.value as typeof resourceStatusFilter)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>}</div>
      {showResourceForm && canManage.data && <form key={editingResource?.id ?? 'new'} id="emergency-resource-editor" aria-label={editingResource ? 'Edit emergency resource draft' : 'Add emergency resource'} className="ops-form emergency-resource-form" onSubmit={(event) => void saveResource(event)}><div className="ops-form-grid">
        <label>Resource type<select name="type" defaultValue={editingResource?.resource_type ?? 'emergency_contact'}><option value="emergency_contact">Emergency contact</option><option value="evacuation_center">Evacuation center</option></select></label>
        <label>Name<input name="name" required minLength={2} maxLength={120} defaultValue={editingResource?.name ?? ''} placeholder="Office, hotline, or center name" /></label>
        <label>Phone or hotline <span className="field-hint">Required for an emergency contact</span><input name="phone" type="tel" maxLength={40} defaultValue={editingResource?.phone ?? ''} /></label>
        <label>Address <span className="field-hint">Required for an evacuation center</span><input name="address" maxLength={250} defaultValue={editingResource?.address ?? ''} /></label>
        <label className="span-two">Additional public details <span className="field-hint">Optional; do not include private personal information</span><textarea name="details" rows={3} maxLength={1000} defaultValue={editingResource?.details ?? ''} /></label>
      </div><div className="ops-form-actions"><span className="field-hint">{editingResource ? 'This draft remains private until published.' : 'New entries remain private drafts until published.'}</span><button type="button" className="button outline" onClick={() => { setEditingResource(null); setShowResourceForm(false) }}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : editingResource ? 'Save changes' : 'Save draft'}</button></div></form>}
      {resources.isPending && enabled && <LoadingNotice compact />}{resources.error && <ErrorNotice message={resources.error.message} />}
      {canManage.data && resourceActivity.error && <ErrorNotice message={resourceActivity.error.message} />}
      {!resources.isPending && !resources.error && resources.data?.length === 0 && <p className="field-hint">No emergency resources have been added yet.</p>}
      {!resources.isPending && !resources.error && (resources.data?.length ?? 0) > 0 && visibleResources.length === 0 && <p className="field-hint">No resources match these filters. Change the type, status, or search text.</p>}
      <div className="emergency-resource-list">{visibleResources.map((resource) => {
        const activity = resourceActivity.data?.filter((entry) => entry.resource_id === resource.id) ?? []
        return <article className={`emergency-resource-card emergency-resource-${resource.status}`} key={resource.id}>
          <header><div><StatusPill status={resource.status} /><span>{resource.resource_type === 'emergency_contact' ? 'Emergency contact' : 'Evacuation center'}</span></div>{canManage.data && resource.status !== 'archived' && <div className="row-actions">{resource.status === 'draft' && <><button disabled={busy} onClick={() => editResource(resource)}>Edit draft</button><button disabled={busy} onClick={() => void publishResource(resource.id)}>Publish</button></>}<button className="danger-action" disabled={busy} onClick={() => void archiveResource(resource.id)}>Archive</button></div>}</header>
          <h3>{resource.name}</h3>{resource.phone && <a href={`tel:${resource.phone.replace(/[^0-9+]/g, '')}`}><Phone size={14} />{resource.phone}</a>}{resource.address && <p><MapPin size={14} />{resource.address}</p>}{resource.resource_type === 'evacuation_center' && resource.address && <a className="emergency-resource-map-link" aria-label="Open this evacuation center in Google Maps (opens in a new tab)" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(resource.address)}`} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open location in Google Maps</a>}{resource.details && <p className="emergency-resource-details">{resource.details}</p>}
          {canManage.data && <details className="incident-history"><summary>Change history ({activity.length})</summary><ol>{activity.map((entry) => <li key={`${entry.action}-${entry.created_at}`}><strong>{entry.action}</strong><span>{formatDateTime(entry.created_at)} · {entry.actor_name}</span>{entry.note && <p>{entry.note}</p>}</li>)}</ol></details>}
        </article>
      })}</div>
    </section>
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>Draft a disaster advisory</h2><p>Verify the information and instructions before publishing.</p></div><Megaphone size={19} /></div><div className="ops-form-grid">
      <label>Type<select name="type"><option value="weather">Weather</option><option value="flood">Flood</option><option value="fire">Fire</option><option value="earthquake">Earthquake</option><option value="landslide">Landslide</option><option value="health">Public health</option><option value="other">Other</option></select></label>
      <label>Severity<select name="severity"><option value="information">Information</option><option value="watch">Watch</option><option value="warning">Warning</option><option value="emergency">Emergency</option></select></label>
      <label className="span-two">Advisory title<input name="title" maxLength={180} required /></label>
      <label className="span-two">Affected area<input name="area" maxLength={240} placeholder="Purok, street, or barangay-wide" required /></label>
      <label className="span-two">Verified instructions<textarea name="instructions" maxLength={4000} minLength={3} rows={5} required placeholder="Include verified guidance and where residents can get help." /></label>
      <label>Expires (optional)<input name="expiry" type="datetime-local" /></label>
    </div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Save draft</button></div></form>}
    {advisories.isPending && enabled && <LoadingNotice />}{advisories.error && <ErrorNotice message={advisories.error.message} />}
    {enabled && <div className="advisory-filters"><label>Search advisories<input value={advisorySearch} onChange={(event) => setAdvisorySearch(event.target.value)} placeholder="Title, affected area, or instructions" /></label><label>Severity<select value={advisorySeverityFilter} onChange={(event) => { setAdvisorySeverityFilter(event.target.value as typeof advisorySeverityFilter); setPage(0) }}><option value="all">All severities</option><option value="information">Information</option><option value="watch">Watch</option><option value="warning">Warning</option><option value="emergency">Emergency</option></select></label>{canManage.data && <label>Status<select value={advisoryStatusFilter} onChange={(event) => { setAdvisoryStatusFilter(event.target.value as typeof advisoryStatusFilter); setPage(0) }}><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="resolved">Resolved</option></select></label>}</div>}
    {advisories.data?.total === 0 && (debouncedAdvisorySearch || advisorySeverityFilter !== 'all' || advisoryStatusFilter !== 'all') && <p className="field-hint">No advisories match these filters. Change the search, severity, or status.</p>}
    {advisories.data?.total === 0 && !debouncedAdvisorySearch && advisorySeverityFilter === 'all' && advisoryStatusFilter === 'all' && <div className="ops-empty"><Megaphone size={22} /><strong>No advisories available</strong><p>Published disaster advisories will appear here.</p></div>}
    {advisories.data?.total ? visibleAdvisories.length ? null : <p className="field-hint">No advisories are available on this page. Return to the previous page.</p> : null}
    <div className="advisory-list">{visibleAdvisories.map((advisory) => {
      const expired = advisory.expires_at ? new Date(advisory.expires_at).getTime() <= Date.now() : false
      const advisoryEvents = events.data?.filter((item) => item.advisory_id === advisory.id) ?? []
      return <article className={`ops-panel advisory-card advisory-${advisory.severity}`} key={advisory.id}>
        <header><div><StatusPill status={expired ? 'expired' : advisory.status} /><span className={`incident-severity severity-${advisory.severity === 'emergency' ? 'urgent' : advisory.severity === 'warning' ? 'high' : advisory.severity === 'watch' ? 'moderate' : 'low'}`}>{advisory.severity}</span></div><small>{advisory.advisory_type}</small></header>
        <h2>{advisory.title}</h2><p className="advisory-area">Affected area: {advisory.affected_area}</p>
        <p className="advisory-instructions">{advisory.instructions}</p>
        <div className="incident-meta"><span>{advisory.published_at ? `Published ${formatDateTime(advisory.published_at)}` : `Draft created ${formatDateTime(advisory.created_at)}`}</span>{advisory.expires_at && <span>{expired ? 'Expired' : `Expires ${formatDateTime(advisory.expires_at)}`}</span>}</div>
        {advisory.resolution_note && <p className="finance-review-note">Resolution: {advisory.resolution_note}</p>}
        {canManage.data && <div className="finance-review-actions">{advisory.status === 'draft' && <button className="button primary" disabled={busy || expired} onClick={() => void publish(advisory.id)}>Publish</button>}{advisory.status === 'published' && <button className="button outline" disabled={busy} onClick={() => void resolve(advisory.id)}>Resolve advisory</button>}</div>}
        {canManage.data && <details className="incident-history"><summary>Advisory history ({advisoryEvents.length})</summary><ol>{advisoryEvents.map((item) => <li key={item.id}><strong>{item.action}</strong><span>{formatDateTime(item.created_at)}</span>{item.note && <p>{item.note}</p>}</li>)}</ol></details>}
      </article>
    })}</div>
    {advisories.data && advisories.data.total > DISASTER_ADVISORY_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Disaster advisory pages">
      <button className="button outline" disabled={page === 0 || advisories.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
      <span className="field-hint">Page {page + 1} of {Math.ceil(advisories.data.total / DISASTER_ADVISORY_PAGE_SIZE)}</span>
      <button className="button outline" disabled={(page + 1) * DISASTER_ADVISORY_PAGE_SIZE >= advisories.data.total || advisories.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button>
    </nav>}
  </section>
}
