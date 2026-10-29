import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { AlertTriangle, CheckCircle2, Megaphone } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { createDisasterAdvisory, listDisasterAdvisories, listDisasterAdvisoryEvents, publishDisasterAdvisory, resolveDisasterAdvisory } from './disaster-data'
import { ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const advisorySchema = z.object({ type: z.enum(['weather','flood','fire','earthquake','landslide','health','other']), severity: z.enum(['information','watch','warning','emergency']), title: z.string().trim().min(3).max(180), area: z.string().trim().min(2).max(240), instructions: z.string().trim().min(3).max(4000), expiry: z.string() })

export function DisasterAdvisoriesPage() {
  const { membership } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'disaster.manage'], queryFn: () => hasPermission(tenantId, 'disaster.manage'), enabled: Boolean(tenantId) })
  const canRead = useQuery({ queryKey: ['permission', tenantId, 'disaster.read'], queryFn: () => hasPermission(tenantId, 'disaster.read'), enabled: Boolean(tenantId) })
  const enabled = Boolean(tenantId && (canManage.data || canRead.data))
  const advisories = useQuery({ queryKey: ['disaster-advisories', tenantId], queryFn: () => listDisasterAdvisories(tenantId), enabled })
  const events = useQuery({ queryKey: ['disaster-advisory-events', tenantId], queryFn: () => listDisasterAdvisoryEvents(tenantId), enabled: Boolean(tenantId && canManage.data) })
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['disaster-advisories', tenantId] }), queryClient.invalidateQueries({ queryKey: ['disaster-advisory-events', tenantId] })])
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = advisorySchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the advisory.'); return }
    const expiresAt = parsed.data.expiry ? new Date(parsed.data.expiry) : null
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) { setError('Expiry must be a future date and time.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await createDisasterAdvisory({ tenantId, type: parsed.data.type, severity: parsed.data.severity, title: parsed.data.title, area: parsed.data.area, instructions: parsed.data.instructions, expiresAt: expiresAt?.toISOString() ?? null }); await refresh(); form.reset(); setShowForm(false); setMessage('Advisory draft saved. Review it before publishing.') }
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
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>Draft a disaster advisory</h2><p>Verify the information and instructions before publishing.</p></div><Megaphone size={19} /></div><div className="ops-form-grid">
      <label>Type<select name="type"><option value="weather">Weather</option><option value="flood">Flood</option><option value="fire">Fire</option><option value="earthquake">Earthquake</option><option value="landslide">Landslide</option><option value="health">Public health</option><option value="other">Other</option></select></label>
      <label>Severity<select name="severity"><option value="information">Information</option><option value="watch">Watch</option><option value="warning">Warning</option><option value="emergency">Emergency</option></select></label>
      <label className="span-two">Advisory title<input name="title" maxLength={180} required /></label>
      <label className="span-two">Affected area<input name="area" maxLength={240} placeholder="Purok, street, or barangay-wide" required /></label>
      <label className="span-two">Verified instructions<textarea name="instructions" maxLength={4000} minLength={3} rows={5} required placeholder="Include verified guidance and where residents can get help." /></label>
      <label>Expires (optional)<input name="expiry" type="datetime-local" /></label>
    </div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Save draft</button></div></form>}
    {advisories.isPending && enabled && <LoadingNotice />}{advisories.error && <ErrorNotice message={advisories.error.message} />}
    {advisories.data?.length === 0 && <div className="ops-empty"><Megaphone size={22} /><strong>No advisories available</strong><p>Published disaster advisories will appear here.</p></div>}
    <div className="advisory-list">{advisories.data?.map((advisory) => {
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
  </section>
}
