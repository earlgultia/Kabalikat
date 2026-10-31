import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { ArrowLeftRight, CheckCircle2, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { acknowledgeReferral, closeReferral, createInterbarangayReferral, declineReferral, listInterbarangayReferralActivity, listInterbarangayReferrals, listReferralDestinations, REFERRAL_DESTINATION_PAGE_SIZE, REFERRAL_PAGE_SIZE, respondReferral, type InterbarangayReferral } from './referrals-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const referralSchema = z.object({ destination: z.string().uuid(), purpose: z.string().trim().min(3).max(180), basis: z.string().trim().min(3).max(500), information: z.string().trim().min(3).max(2000), incident: z.string().trim().optional(), confirmed: z.literal('yes') })
const responseSchema = z.object({ response: z.string().trim().min(3).max(2000) })

function ReferralActivityHistory({ referralId }: { referralId: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const activity = useQuery({ queryKey: ['interbarangay-referral-activity', referralId, page], queryFn: () => listInterbarangayReferralActivity(referralId, page), enabled: open })
  const total = activity.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / REFERRAL_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])
  return <details className="sk-event-audit referral-audit" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Activity history{activity.data ? ` (${activity.data.total})` : ''}</summary>
    {open && activity.isPending && <p className="field-hint" role="status">Loading activity…</p>}
    {open && activity.error && <p className="account-security-error" role="alert">Activity history could not be loaded.</p>}
    {open && activity.data && <>
      {activity.data.rows.length ? <ol>{activity.data.rows.map((entry) => <li key={`${entry.action}-${entry.created_at}`}><span><strong>{entry.action.replaceAll('_', ' ')}</strong><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></span><small>{entry.actor_name}</small></li>)}</ol> : <p className="field-hint">No activity is recorded for this referral.</p>}
      {pageCount > 1 && <nav className="ops-form-actions" aria-label="Referral activity pages"><button type="button" className="button outline" disabled={currentPage === 0 || activity.isFetching} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} />Previous</button><span className="field-hint">Page {currentPage + 1} of {pageCount}</span><button type="button" className="button outline" disabled={currentPage + 1 >= pageCount || activity.isFetching} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={15} /></button></nav>}
    </>}
  </details>
}

function ReferralDestinationPicker({ originId, value, onChange }: { originId: string; value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const destinations = useQuery({
    queryKey: ['referral-destinations', originId, page, search],
    queryFn: () => listReferralDestinations(originId, page, search),
  })
  const rows = destinations.data?.rows ?? []
  const total = destinations.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / REFERRAL_DESTINATION_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])
  return <div className="referral-destination-picker">
    <label htmlFor="referral-destination-search">Search active barangays</label>
    <input id="referral-destination-search" maxLength={100} placeholder="Name, municipality, or code" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); onChange('') }} />
    {destinations.isPending && <p className="field-hint" role="status">Loading active barangays…</p>}
    {destinations.error && <p className="ops-error" role="alert">Unable to load destination barangays.</p>}
    {destinations.data && total > 0 && <>
      <fieldset className="referral-destination-options"><legend>Choose a receiving barangay</legend>{rows.map((item) => <label className={value === item.id ? 'selected' : ''} key={item.id}><input type="radio" name="destination-picker" value={item.id} checked={value === item.id} onChange={() => onChange(item.id)} /><span><strong>{item.name}</strong><small>{item.municipality}, {item.province} · {item.code}</small></span></label>)}</fieldset>
      <div className="referral-destination-pagination"><span aria-live="polite">Showing {currentPage * REFERRAL_DESTINATION_PAGE_SIZE + 1}–{Math.min((currentPage + 1) * REFERRAL_DESTINATION_PAGE_SIZE, total)} of {total}</span><div><button type="button" className="button outline" disabled={currentPage === 0 || destinations.isFetching} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} />Previous</button><button type="button" className="button outline" disabled={currentPage + 1 >= pageCount || destinations.isFetching} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={15} /></button></div></div>
    </>}
    {destinations.data && total === 0 && <p className="field-hint">{search ? 'No active barangays match that search.' : 'No other active barangays are available.'}</p>}
  </div>
}

export function ReferralsPage() {
  const { membership } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const canCreate = useQuery({ queryKey: ['permission', tenantId, 'referrals.create'], queryFn: () => hasPermission(tenantId, 'referrals.create'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'referrals.review'], queryFn: () => hasPermission(tenantId, 'referrals.review'), enabled: Boolean(tenantId) })
  const referrals = useQuery({ queryKey: ['interbarangay-referrals', tenantId, page], queryFn: () => listInterbarangayReferrals(page), enabled: Boolean(tenantId && (canCreate.data || canReview.data)) })
  const referralRows = referrals.data?.rows ?? []
  const totalReferrals = referrals.data?.total ?? 0
  const referralPages = Math.max(1, Math.ceil(totalReferrals / REFERRAL_PAGE_SIZE))
  const currentPage = Math.min(page, referralPages - 1)
  useEffect(() => { setPage(0) }, [tenantId])
  useEffect(() => { if (page !== currentPage) setPage(currentPage) }, [currentPage, page])
  const [showForm, setShowForm] = useState(false)
  const [destinationId, setDestinationId] = useState('')
  const [replyId, setReplyId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['interbarangay-referrals', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['interbarangay-referral-activity'] }),
    ])
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const raw = Object.fromEntries(new FormData(form).entries())
    const parsed = referralSchema.safeParse(raw)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the referral details.'); return }
    const incident = parsed.data.incident?.trim() ?? ''
    if (incident && !z.string().uuid().safeParse(incident).success) { setError('Enter a valid incident reference, or leave it blank.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await createInterbarangayReferral({ originId: tenantId, destinationId: parsed.data.destination, purpose: parsed.data.purpose, basis: parsed.data.basis, information: parsed.data.information, incidentId: incident, confirmed: true })
      await refresh(); form.reset(); setDestinationId(''); setShowForm(false); setMessage('Referral sent to the receiving barangay.')
    } catch { setError('Unable to create this referral. Check the disclosure basis and details, then try again.') }
    finally { setBusy(false) }
  }

  async function act(referral: InterbarangayReferral, action: 'acknowledge' | 'decline' | 'close') {
    if (action === 'decline') {
      const reason = window.prompt('Reason for declining this referral (3–500 characters):')?.trim() ?? ''
      if (reason.length < 3 || reason.length > 500) return
      setBusy(true); setError(''); setMessage('')
      try { await declineReferral(referral.id, reason); await refresh(); setMessage('Referral declined with a reason.') }
      catch { setError('Unable to decline this referral.') }
      finally { setBusy(false) }
      return
    }
    const actionLabel = action === 'acknowledge' ? 'Acknowledge receipt of' : 'Close'
    if (!window.confirm(`${actionLabel} this referral?`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (action === 'acknowledge') await acknowledgeReferral(referral.id)
      else await closeReferral(referral.id)
      await refresh(); setMessage(action === 'acknowledge' ? 'Referral acknowledged.' : 'Referral closed.')
    } catch { setError('Unable to update this referral. Refresh and try again.') }
    finally { setBusy(false) }
  }

  async function reply(event: FormEvent<HTMLFormElement>, referralId: string) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = responseSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the response.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await respondReferral(referralId, parsed.data.response); await refresh(); form.reset(); setReplyId(''); setMessage('Referral response sent.') }
    catch { setError('Unable to send this response. Refresh and try again.') }
    finally { setBusy(false) }
  }

  const canAccess = canCreate.data || canReview.data
  return <section className="operation-page">
    <PageHeading title="Inter-barangay referrals" description="Send limited, purpose-specific referrals and track responses between barangays.">
      {canCreate.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}><ArrowLeftRight size={15} />New referral</button>}
    </PageHeading>
    <div className="ops-panel referral-privacy-notice"><ShieldAlert size={18} /><p><strong>Share only what is necessary.</strong> Use this workflow only when your barangay has an approved disclosure basis and policy. Do not include unrelated resident records, medical details, or information about family members. This feature does not contact emergency services.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to review inter-barangay referrals." />}
    {Boolean(tenantId) && (canCreate.isPending || canReview.isPending) && <LoadingNotice compact />}
    {(canCreate.error || canReview.error) && <ErrorNotice message="Your referral access could not be checked. Refresh the page or contact your barangay administrator." />}
    {message && <div className="ops-success" role="status"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canAccess && !canCreate.isPending && !canReview.isPending && !canCreate.error && !canReview.error && <EmptyNotice title="Referral access is restricted" detail="Only designated Captains and Secretaries can create or review inter-barangay referrals. Contact your barangay administrator if you need access." />}
    {showForm && canCreate.data && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>Create a referral</h2><p>The receiving barangay will see only the information included in this referral.</p></div><ArrowLeftRight size={19} /></div>
      <input type="hidden" name="destination" value={destinationId} />
      <div className="ops-form-grid"><div className="span-two"><ReferralDestinationPicker originId={tenantId} value={destinationId} onChange={setDestinationId} /></div><label>Referral purpose<input name="purpose" minLength={3} maxLength={180} required placeholder="Why is this referral needed?" /></label><label className="span-two">Disclosure basis / authorization<input name="basis" minLength={3} maxLength={500} required placeholder="State the approved policy or authority for this disclosure" /></label><label className="span-two">Minimum necessary information<textarea name="information" minLength={3} maxLength={2000} required placeholder="Share only details needed by the receiving barangay to act on this referral." /><span className="field-hint">Do not paste full resident records, medical details, or unrelated sensitive information.</span></label><label>Related incident reference (optional)<input name="incident" placeholder="Incident record ID" /><span className="field-hint">Use an incident from this barangay that you are authorized to manage.</span></label><label className="referral-confirm"><input type="checkbox" name="confirmed" value="yes" required /><span>I confirm this disclosure follows our approved policy and contains only necessary information.</span></label></div>
      <div className="ops-form-actions"><button className="button primary" disabled={busy || !destinationId}>Send referral</button></div>
    </form>}
    {referrals.isPending && tenantId && canAccess && <LoadingNotice />}{referrals.error && <ErrorNotice message="Unable to load referrals." />}
    {referrals.data && totalReferrals === 0 && <div className="ops-empty"><ArrowLeftRight size={22} /><strong>No referrals yet</strong><p>Referrals created by or sent to this barangay will appear here.</p></div>}
    <div className="referral-list">{referralRows.map((referral) => {
      const receiving = referral.viewer_side === 'receiving'
      return <article className="ops-panel referral-card" key={referral.id}><header><div><StatusPill status={referral.status} /><h2>{referral.purpose}</h2></div><span className="referral-direction">{referral.origin_name} → {referral.receiving_name}</span></header><div className="referral-detail-grid"><div><span>Disclosure basis</span><p>{referral.disclosure_basis}</p></div><div><span>Information shared</span><p>{referral.shared_information}</p></div></div>{referral.incident_id && <p className="referral-reference">Related incident reference: <code>{referral.incident_id}</code></p>}<div className="sk-project-meta"><span>Created {formatDateTime(referral.created_at)}</span>{referral.acknowledged_at && <span>Acknowledged {formatDateTime(referral.acknowledged_at)}</span>}{referral.responded_at && <span>Responded {formatDateTime(referral.responded_at)}</span>}{referral.closed_at && <span>Closed {formatDateTime(referral.closed_at)}</span>}</div>{referral.response && <div className="referral-response"><strong>{referral.status === 'declined' ? 'Decline reason' : 'Receiving barangay response'}</strong><p>{referral.response}</p></div>}
        {canAccess && <ReferralActivityHistory referralId={referral.id} />}
        {receiving && canReview.data && <div className="finance-review-actions">{referral.status === 'submitted' && <><button className="button outline danger-action" disabled={busy} onClick={() => void act(referral, 'decline')}>Decline with reason</button><button className="button primary" disabled={busy} onClick={() => void act(referral, 'acknowledge')}>Acknowledge receipt</button></>}{referral.status === 'acknowledged' && (replyId === referral.id ? <form className="referral-reply-form" onSubmit={(event) => void reply(event, referral.id)}><label>Response<textarea name="response" minLength={3} maxLength={2000} required /></label><div><button type="button" className="button outline" onClick={() => setReplyId('')}>Cancel</button><button className="button primary" disabled={busy}>Send response</button></div></form> : <button className="button primary" disabled={busy} onClick={() => setReplyId(referral.id)}>Write response</button>)}</div>}
        {!receiving && canCreate.data && ['responded', 'declined'].includes(referral.status) && <button className="button outline" disabled={busy} onClick={() => void act(referral, 'close')}>Close referral</button>}
      </article>
    })}</div>
    {referralPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="Referral pages"><span className="field-hint">Showing {currentPage * REFERRAL_PAGE_SIZE + 1}–{Math.min((currentPage + 1) * REFERRAL_PAGE_SIZE, totalReferrals)} of {totalReferrals} referrals</span><div className="finance-review-actions"><button className="button outline" disabled={currentPage === 0 || referrals.isFetching} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} />Previous</button><span>Page {currentPage + 1} of {referralPages}</span><button className="button outline" disabled={currentPage + 1 >= referralPages || referrals.isFetching} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={15} /></button></div></nav>}
  </section>
}
