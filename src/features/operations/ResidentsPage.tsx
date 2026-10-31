import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Check, ChevronLeft, ChevronRight, Download, Home, Search, UserPlus, UserRoundPen } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { cancelResidentProfileChange, getOwnResidentDataExport, hasPermission, listHouseholdsPage, listResidents, listResidentsPage, listResidencyVerifications, listResidentProfileChangeRequests, registerResident, reviewResidentProfileChange, submitResidentProfileChange, verifyResident, HOUSEHOLD_PAGE_SIZE, RESIDENT_CORRECTION_PAGE_SIZE, RESIDENT_PAGE_SIZE, type HouseholdRow } from './data'
import { ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const residentSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  birthDate: z.string().optional(),
  phone: z.string().max(40).optional(),
  address: z.string().trim().max(250).optional(),
  householdId: z.string().optional(),
  purok: z.string().max(100).optional(),
}).refine((value) => value.householdId || (value.address?.length ?? 0) >= 3, { message: 'Provide a household address or select an existing household.' })

export function ResidentsPage() {
  const { membership } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const role = membership?.role?.key
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [residentSearch, setResidentSearch] = useState('')
  const [residencyFilter, setResidencyFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [correctionPage, setCorrectionPage] = useState(0)
  const [householdPage, setHouseholdPage] = useState(0)
  const [householdSearch, setHouseholdSearch] = useState('')
  const [debouncedHouseholdSearch, setDebouncedHouseholdSearch] = useState('')
  const [selectedHousehold, setSelectedHousehold] = useState<HouseholdRow | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedSearch(residentSearch); setPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [residentSearch])
  useEffect(() => { setCorrectionPage(0) }, [tenantId, role])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedHouseholdSearch(householdSearch); setHouseholdPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [householdSearch])
  useEffect(() => {
    setHouseholdPage(0)
    setHouseholdSearch('')
    setSelectedHousehold(null)
  }, [tenantId])
  const residents = useQuery({
    queryKey: ['residents', tenantId, role === 'resident' ? 'own' : page, role === 'resident' ? '' : debouncedSearch, role === 'resident' ? 'all' : residencyFilter],
    queryFn: async () => {
      if (role === 'resident') return { rows: await listResidents(tenantId), total: 0, verificationStatuses: {} as Record<string, string> }
      const result = await listResidentsPage(tenantId, page, debouncedSearch, residencyFilter)
      return { rows: result.residents, total: result.total, verificationStatuses: result.verificationStatuses }
    },
    enabled: Boolean(tenantId),
  })
  const residentRows = residents.data?.rows ?? []
  const verifications = useQuery({
    queryKey: ['residency-verifications', tenantId, residentRows.map((resident) => resident.id)],
    queryFn: () => listResidencyVerifications(tenantId, residentRows.map((resident) => resident.id)),
    enabled: Boolean(tenantId && role === 'resident' && residentRows.length),
  })
  const canCreate = useQuery({ queryKey: ['permission', tenantId, 'resident.create'], queryFn: () => hasPermission(tenantId, 'resident.create'), enabled: Boolean(tenantId) })
  const households = useQuery({
    queryKey: ['households', tenantId, householdPage, debouncedHouseholdSearch],
    queryFn: () => listHouseholdsPage(tenantId, householdPage, debouncedHouseholdSearch),
    enabled: Boolean(tenantId && formOpen && canCreate.data),
  })
  const householdTotalPages = Math.ceil((households.data?.totalCount ?? 0) / HOUSEHOLD_PAGE_SIZE)
  useEffect(() => {
    if (householdTotalPages > 0 && householdPage >= householdTotalPages) setHouseholdPage(householdTotalPages - 1)
  }, [householdPage, householdTotalPages])
  const canVerify = useQuery({ queryKey: ['permission', tenantId, 'resident.verify'], queryFn: () => hasPermission(tenantId, 'resident.verify'), enabled: Boolean(tenantId) })
  const canReviewChanges = useQuery({ queryKey: ['permission', tenantId, 'resident.update'], queryFn: () => hasPermission(tenantId, 'resident.update'), enabled: Boolean(tenantId) })
  const profileChanges = useQuery({
    queryKey: ['resident-profile-changes', tenantId, role, correctionPage],
    queryFn: () => listResidentProfileChangeRequests(tenantId, correctionPage, role !== 'resident'),
    enabled: Boolean(tenantId) && (role === 'resident' || canReviewChanges.data === true),
  })
  const ownPendingProfileChanges = useQuery({
    queryKey: ['resident-profile-changes-pending-own', tenantId],
    queryFn: () => listResidentProfileChangeRequests(tenantId, 0, true),
    enabled: Boolean(tenantId && role === 'resident'),
  })
  const correctionTotalPages = Math.ceil((profileChanges.data?.totalCount ?? 0) / RESIDENT_CORRECTION_PAGE_SIZE)
  useEffect(() => {
    if (correctionTotalPages > 0 && correctionPage >= correctionTotalPages) setCorrectionPage(correctionTotalPages - 1)
  }, [correctionPage, correctionTotalPages])
  const correctionRequests = profileChanges.data?.requests ?? []
  const canSelfRegister = role === 'resident' && residentRows.length === 0
  const ownResident = role === 'resident' ? residentRows[0] : undefined
  const latestVerificationByResident = new Map<string, string>(Object.entries(residents.data?.verificationStatuses ?? {}))
  for (const item of [...(verifications.data ?? [])].reverse()) latestVerificationByResident.set(item.resident_id, item.status)
  const filteredResidents = residentRows

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setErrorMessage('')
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    const parsed = residentSchema.safeParse(values)
    if (!parsed.success) { setErrorMessage(parsed.error.issues[0]?.message ?? 'Review the resident details.'); return }
    setBusy(true)
    try {
      await registerResident({
        tenantId, firstName: parsed.data.firstName, lastName: parsed.data.lastName,
        birthDate: parsed.data.birthDate ?? '', phone: parsed.data.phone ?? '',
        address: parsed.data.address ?? '', purok: parsed.data.purok ?? '', householdId: parsed.data.householdId ?? '',
      })
      await queryClient.invalidateQueries({ queryKey: ['residents', tenantId] })
      await queryClient.invalidateQueries({ queryKey: ['residency-verifications', tenantId] })
      setSelectedHousehold(null)
      setHouseholdSearch('')
      setHouseholdPage(0)
      setMessage('Resident record saved. Residency is pending official verification.')
      setFormOpen(false); form.reset()
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to save this resident.') }
    finally { setBusy(false) }
  }

  async function verify(id: string, status: 'verified' | 'rejected') {
    const reason = status === 'rejected' ? window.prompt('Reason for rejecting residency verification:') : ''
    if (status === 'rejected' && !reason?.trim()) return
    try {
      await verifyResident(id, status, reason ?? '')
      await queryClient.invalidateQueries({ queryKey: ['residents', tenantId] })
      await queryClient.invalidateQueries({ queryKey: ['residency-verifications', tenantId] })
      setMessage(status === 'verified' ? 'Residency verified.' : 'Verification decision recorded.')
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to update verification.') }
  }

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setErrorMessage('')
    if (!ownResident) return
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    const firstName = String(values.firstName ?? '').trim()
    const lastName = String(values.lastName ?? '').trim()
    const phone = String(values.phone ?? '').trim()
    if (!firstName && !lastName && !phone) { setErrorMessage('Enter at least one corrected field.'); return }
    setBusy(true)
    try {
      await submitResidentProfileChange({
        residentId: ownResident.id,
        firstName: firstName && firstName !== ownResident.first_name ? firstName : null,
        lastName: lastName && lastName !== ownResident.last_name ? lastName : null,
        phone: phone && phone !== (ownResident.phone ?? '') ? phone : null,
        note: String(values.note ?? '').trim(),
      })
      setCorrectionPage(0)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resident-profile-changes', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['resident-profile-changes-pending-own', tenantId] }),
      ])
      setMessage('Correction request sent for barangay staff review.')
      form.reset()
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to submit this correction.') }
    finally { setBusy(false) }
  }

  async function reviewCorrection(id: string, decision: 'approved' | 'rejected') {
    const reason = decision === 'rejected' ? window.prompt('Reason for declining this correction:') : ''
    if (decision === 'rejected' && !reason?.trim()) return
    try {
      await reviewResidentProfileChange(id, decision, reason ?? '')
      await queryClient.invalidateQueries({ queryKey: ['resident-profile-changes', tenantId] })
      await queryClient.invalidateQueries({ queryKey: ['residents', tenantId] })
      setMessage(decision === 'approved' ? 'Resident profile correction approved.' : 'Correction request declined.')
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to review this correction.') }
  }

  async function cancelCorrection(id: string) {
    if (!window.confirm('Withdraw this profile correction request? You can submit a new request later.')) return
    setBusy(true); setMessage(''); setErrorMessage('')
    try {
      await cancelResidentProfileChange(id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resident-profile-changes', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['resident-profile-changes-pending-own', tenantId] }),
      ])
      setMessage('Your correction request has been withdrawn.')
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to withdraw this correction.') }
    finally { setBusy(false) }
  }

  async function downloadOwnData() {
    setErrorMessage(''); setMessage(''); setExportBusy(true)
    try {
      const data = await getOwnResidentDataExport(tenantId)
      const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = `kabalikat-my-data-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('Your data copy has been downloaded. Keep the file somewhere private.')
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to download your data.') }
    finally { setExportBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Residents & households" description="Maintain barangay resident records and household associations with role-controlled access.">
      {role === 'resident' && ownResident && <button className="button outline" onClick={() => void downloadOwnData()} disabled={exportBusy}><Download size={16} />{exportBusy ? 'Preparing…' : 'Download my data'}</button>}
      {(canCreate.data || canSelfRegister) && <button className="button primary" onClick={() => { setFormOpen((open) => !open); setSelectedHousehold(null); setHouseholdSearch(''); setHouseholdPage(0) }}><UserPlus size={16} />{canSelfRegister ? 'Register my household' : 'Add resident'}</button>}
    </PageHeading>
    {message && <div className="ops-success"><Check size={16} />{message}</div>}
    {errorMessage && <ErrorNotice message={errorMessage} />}
    {role === 'resident' && ownResident && <section className="ops-panel resident-correction-panel">
      <div className="ops-panel-heading"><div><h2>Request a profile correction</h2><p>Changes are sent to authorized barangay staff. Your official record changes only after approval.</p></div><UserRoundPen size={19} /></div>
      {ownPendingProfileChanges.isPending ? <LoadingNotice compact /> : ownPendingProfileChanges.error ? <ErrorNotice message="Your pending request status could not be checked. Refresh before submitting another correction." /> : (ownPendingProfileChanges.data?.totalCount ?? 0) > 0 ? <p className="field-hint">You already have a pending request. You can submit another after staff review.</p> : <form className="ops-form" onSubmit={(event) => void submitCorrection(event)}>
        <div className="ops-form-grid"><label>First name<input name="firstName" maxLength={100} placeholder={`Current: ${ownResident.first_name}`} autoComplete="given-name" /></label>
          <label>Last name<input name="lastName" maxLength={100} placeholder={`Current: ${ownResident.last_name}`} autoComplete="family-name" /></label>
          <label>Phone<input name="phone" type="tel" maxLength={40} placeholder={`Current: ${ownResident.phone || 'Not provided'}`} autoComplete="tel" /></label>
          <label className="span-two">Note for the reviewer <span className="field-hint">Optional</span><textarea name="note" maxLength={500} rows={2} placeholder="Briefly explain the correction" /></label>
        </div><div className="ops-form-actions"><span className="field-hint">Only enter fields that need correction.</span><button className="button primary" disabled={busy}>{busy ? 'Sending…' : 'Send for review'}</button></div>
      </form>}
      {correctionRequests.length ? <div className="resident-correction-history"><h3>Your requests</h3><ul>{correctionRequests.map((request) => {
        const proposedChanges = [
          request.proposed_first_name && `First name: ${request.proposed_first_name}`,
          request.proposed_last_name && `Last name: ${request.proposed_last_name}`,
          request.proposed_phone && `Phone: ${request.proposed_phone}`,
        ].filter(Boolean).join(' · ')
        return <li key={request.id}><span><strong>{request.status === 'pending' ? 'Awaiting review' : request.status === 'approved' ? 'Approved' : request.status === 'cancelled' ? 'Withdrawn' : 'Declined'}</strong><small>{new Date(request.created_at).toLocaleDateString()}</small><small className="resident-correction-proposal">{proposedChanges}</small>{request.request_note && <small>Note: {request.request_note}</small>}{request.status === 'rejected' && request.review_reason && <small>Review note: {request.review_reason}</small>}</span><div className="row-actions"><StatusPill status={request.status} />{request.status === 'pending' && <button disabled={busy} onClick={() => void cancelCorrection(request.id)}>Withdraw</button>}</div></li>
      })}</ul>{correctionTotalPages > 1 && <nav className="ops-form-actions" aria-label="Your correction request pages"><span className="field-hint">Page {correctionPage + 1} of {correctionTotalPages}</span><div className="finance-review-actions"><button className="button outline" disabled={correctionPage === 0 || profileChanges.isFetching} onClick={() => setCorrectionPage((current) => current - 1)}><ChevronLeft size={15} />Previous</button><button className="button outline" disabled={correctionPage + 1 >= correctionTotalPages || profileChanges.isFetching} onClick={() => setCorrectionPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></div></nav>}</div> : null}
    </section>}
    {canReviewChanges.data && correctionRequests.some((request) => request.status === 'pending') && <section className="ops-panel resident-correction-panel">
      <div className="ops-panel-heading"><div><h2>Profile correction requests</h2><p>Confirm each correction before updating the official resident record.</p></div><UserRoundPen size={19} /></div>
      <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Resident</th><th>Requested changes</th><th>Submitted</th><th>Decision</th></tr></thead><tbody>
        {correctionRequests.filter((request) => request.status === 'pending').map((request) => <tr key={request.id}>
          <td><strong>{request.resident ? `${request.resident.first_name} ${request.resident.last_name}` : 'Resident record'}</strong><small>Resident ID · {request.resident_id.slice(0, 8)}</small></td>
          <td>{[request.proposed_first_name && `First name: ${request.proposed_first_name}`, request.proposed_last_name && `Last name: ${request.proposed_last_name}`, request.proposed_phone && `Phone: ${request.proposed_phone}`].filter(Boolean).map((change) => <small key={change}>{change}</small>)}{request.request_note && <small>Note: {request.request_note}</small>}</td>
          <td>{new Date(request.created_at).toLocaleDateString()}</td><td><div className="row-actions"><button onClick={() => void reviewCorrection(request.id, 'approved')}>Approve</button><button className="danger-action" onClick={() => void reviewCorrection(request.id, 'rejected')}>Decline</button></div></td>
        </tr>)}
      </tbody></table></div>
      {correctionTotalPages > 1 && <nav className="ops-form-actions" aria-label="Pending correction request pages"><span className="field-hint">Page {correctionPage + 1} of {correctionTotalPages} · {profileChanges.data?.totalCount ?? 0} requests</span><div className="finance-review-actions"><button className="button outline" disabled={correctionPage === 0 || profileChanges.isFetching} onClick={() => setCorrectionPage((current) => current - 1)}><ChevronLeft size={15} />Previous</button><button className="button outline" disabled={correctionPage + 1 >= correctionTotalPages || profileChanges.isFetching} onClick={() => setCorrectionPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></div></nav>}
    </section>}
    {formOpen && <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>{canSelfRegister ? 'Your resident profile' : 'New resident record'}</h2><p>Details are visible only to authorized barangay staff and the linked resident.</p></div><Home size={18} /></div>
      <div className="ops-form-grid"><label>First name<input name="firstName" required maxLength={100} /></label><label>Last name<input name="lastName" required maxLength={100} /></label>
        <label>Date of birth <span className="field-hint">Optional</span><input name="birthDate" type="date" max={new Date().toISOString().slice(0, 10)} /></label><label>Phone <span className="field-hint">Optional</span><input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
        {canCreate.data && <div className="span-two resident-household-picker"><strong>Existing household <span className="field-hint">Optional</span></strong>
          <input type="hidden" name="householdId" value={selectedHousehold?.id ?? ''} />
          {selectedHousehold ? <div className="resident-household-selected"><span>{selectedHousehold.household_code} · {selectedHousehold.address_line}</span><button type="button" className="button outline" onClick={() => setSelectedHousehold(null)}>Choose another household</button></div> : <>
            <input type="search" aria-label="Search existing households" value={householdSearch} onChange={(event) => setHouseholdSearch(event.target.value)} placeholder="Search household code or address" maxLength={80} />
            {households.isPending ? <p className="field-hint" role="status">Loading households…</p> : households.error ? <ErrorNotice message="Households could not be loaded. You can still enter an address for a new household." /> : <>
              <select aria-label="Existing households on this page" value="" onChange={(event) => setSelectedHousehold(households.data?.households.find((household) => household.id === event.target.value) ?? null)}><option value="">Create a new household or choose one below</option>{households.data?.households.map((household) => <option key={household.id} value={household.id}>{household.household_code} · {household.address_line}</option>)}</select>
              {households.data?.totalCount === 0 && <p className="field-hint">No matching households. Enter an address below to create a new household.</p>}
              {householdTotalPages > 1 && <nav className="finance-review-actions" aria-label="Household selection pages"><span className="field-hint">Page {householdPage + 1} of {householdTotalPages} · {households.data?.totalCount} households</span><button type="button" className="button outline" disabled={householdPage === 0 || households.isFetching} onClick={() => setHouseholdPage((current) => current - 1)}><ChevronLeft size={15} />Previous</button><button type="button" className="button outline" disabled={householdPage + 1 >= householdTotalPages || households.isFetching} onClick={() => setHouseholdPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></nav>}
            </>}
          </>}
        </div>}
        <label className="span-two">Household address <span className="field-hint">Required for a new household</span><input name="address" maxLength={250} /></label><label>Purok / zone <span className="field-hint">Optional</span><input name="purok" maxLength={100} /></label>
      </div>
      <div className="ops-form-actions"><span className="field-hint">A household record is created with residency status set to pending.</span><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save resident'}</button></div>
    </form>}
    {residents.isPending ? <LoadingNotice /> : residents.error ? <ErrorNotice message={residents.error.message} /> : !residentRows.length && (role === 'resident' || !residents.data?.total) ?
      <div className="ops-empty"><Home size={22} /><strong>{role !== 'resident' && (debouncedSearch || residencyFilter !== 'all') ? 'No matching residents' : 'No resident records available'}</strong><p>{role !== 'resident' && (debouncedSearch || residencyFilter !== 'all') ? 'Try another search or residency status.' : 'Records appear here when they are registered for this barangay.'}</p></div> :
      <>
      {role !== 'resident' && <div className="community-calendar-filters">
        <label className="community-calendar-search"><Search size={16} /><input type="search" aria-label="Search resident records" value={residentSearch} onChange={(event) => setResidentSearch(event.target.value)} placeholder="Search name, phone, household, or address" /></label>
        <label>Residency status<select value={residencyFilter} onChange={(event) => { setResidencyFilter(event.target.value); setPage(0) }}><option value="all">All statuses</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label>
      </div>}
      {role !== 'resident' && <p className="field-hint" aria-live="polite">Showing {filteredResidents.length} resident {filteredResidents.length === 1 ? 'record' : 'records'} on this page. {residents.data?.total ?? 0} records match these filters.</p>}
      {filteredResidents.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Resident</th><th>Household</th><th>Contact</th><th>Residency</th><th>Record</th></tr></thead><tbody>
        {filteredResidents.map((resident) => <tr key={resident.id}><td><strong>{resident.first_name} {resident.last_name}</strong><small>{resident.birth_date ? new Date(resident.birth_date + 'T00:00:00').toLocaleDateString() : 'Birth date not recorded'}</small></td><td>{resident.household?.household_code ?? '—'}<small>{resident.household?.purok ?? resident.household?.address_line ?? 'Address unavailable'}</small></td><td>{resident.phone ?? '—'}</td><td><StatusPill status={latestVerificationByResident.get(resident.id) ?? 'pending'} />{canVerify.data && <div className="row-actions"><button onClick={() => void verify(resident.id, 'verified')}>Verify</button><button onClick={() => void verify(resident.id, 'rejected')}>Reject</button></div>}</td><td><StatusPill status={resident.record_status} /></td></tr>)}
      </tbody></table></div> : <div className="ops-empty"><Search size={22} /><strong>No residents on this page match that status</strong><p>Choose another status or move to another page.</p></div>}
      {role !== 'resident' && (residents.data?.total ?? 0) > RESIDENT_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Resident directory pages">
        <button className="button outline" disabled={page === 0 || residents.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
        <span className="field-hint">Page {page + 1} of {Math.ceil((residents.data?.total ?? 0) / RESIDENT_PAGE_SIZE)}</span>
        <button className="button outline" disabled={(page + 1) * RESIDENT_PAGE_SIZE >= (residents.data?.total ?? 0) || residents.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button>
      </nav>}
      </>}
    {canCreate.isPending && <LoadingNotice compact />}
  </section>
}

