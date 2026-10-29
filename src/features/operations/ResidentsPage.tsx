import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Check, Download, Home, UserPlus, UserRoundPen } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { cancelResidentProfileChange, getOwnResidentDataExport, hasPermission, listHouseholds, listResidents, listResidencyVerifications, listResidentProfileChangeRequests, registerResident, reviewResidentProfileChange, submitResidentProfileChange, verifyResident } from './data'
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
  const residents = useQuery({ queryKey: ['residents', tenantId], queryFn: () => listResidents(tenantId), enabled: Boolean(tenantId) })
  const households = useQuery({ queryKey: ['households', tenantId], queryFn: () => listHouseholds(tenantId), enabled: Boolean(tenantId) })
  const verifications = useQuery({ queryKey: ['residency-verifications', tenantId], queryFn: () => listResidencyVerifications(tenantId), enabled: Boolean(tenantId) })
  const canCreate = useQuery({ queryKey: ['permission', tenantId, 'resident.create'], queryFn: () => hasPermission(tenantId, 'resident.create'), enabled: Boolean(tenantId) })
  const canVerify = useQuery({ queryKey: ['permission', tenantId, 'resident.verify'], queryFn: () => hasPermission(tenantId, 'resident.verify'), enabled: Boolean(tenantId) })
  const canReviewChanges = useQuery({ queryKey: ['permission', tenantId, 'resident.update'], queryFn: () => hasPermission(tenantId, 'resident.update'), enabled: Boolean(tenantId) })
  const profileChanges = useQuery({ queryKey: ['resident-profile-changes', tenantId], queryFn: () => listResidentProfileChangeRequests(tenantId), enabled: Boolean(tenantId) && (role === 'resident' || canReviewChanges.data === true) })
  const canSelfRegister = role === 'resident' && residents.data?.length === 0
  const ownResident = role === 'resident' ? residents.data?.[0] : undefined

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
      await queryClient.invalidateQueries({ queryKey: ['resident-profile-changes', tenantId] })
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
      await queryClient.invalidateQueries({ queryKey: ['resident-profile-changes', tenantId] })
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
      {(canCreate.data || canSelfRegister) && <button className="button primary" onClick={() => setFormOpen((open) => !open)}><UserPlus size={16} />{canSelfRegister ? 'Register my household' : 'Add resident'}</button>}
    </PageHeading>
    {message && <div className="ops-success"><Check size={16} />{message}</div>}
    {errorMessage && <ErrorNotice message={errorMessage} />}
    {role === 'resident' && ownResident && <section className="ops-panel resident-correction-panel">
      <div className="ops-panel-heading"><div><h2>Request a profile correction</h2><p>Changes are sent to authorized barangay staff. Your official record changes only after approval.</p></div><UserRoundPen size={19} /></div>
      {profileChanges.data?.some((request) => request.status === 'pending') ? <p className="field-hint">You already have a pending request. You can submit another after staff review.</p> : <form className="ops-form" onSubmit={(event) => void submitCorrection(event)}>
        <div className="ops-form-grid"><label>First name<input name="firstName" maxLength={100} placeholder={`Current: ${ownResident.first_name}`} autoComplete="given-name" /></label>
          <label>Last name<input name="lastName" maxLength={100} placeholder={`Current: ${ownResident.last_name}`} autoComplete="family-name" /></label>
          <label>Phone<input name="phone" type="tel" maxLength={40} placeholder={`Current: ${ownResident.phone || 'Not provided'}`} autoComplete="tel" /></label>
          <label className="span-two">Note for the reviewer <span className="field-hint">Optional</span><textarea name="note" maxLength={500} rows={2} placeholder="Briefly explain the correction" /></label>
        </div><div className="ops-form-actions"><span className="field-hint">Only enter fields that need correction.</span><button className="button primary" disabled={busy}>{busy ? 'Sending…' : 'Send for review'}</button></div>
      </form>}
      {profileChanges.data?.length ? <div className="resident-correction-history"><h3>Your requests</h3><ul>{profileChanges.data.map((request) => {
        const proposedChanges = [
          request.proposed_first_name && `First name: ${request.proposed_first_name}`,
          request.proposed_last_name && `Last name: ${request.proposed_last_name}`,
          request.proposed_phone && `Phone: ${request.proposed_phone}`,
        ].filter(Boolean).join(' · ')
        return <li key={request.id}><span><strong>{request.status === 'pending' ? 'Awaiting review' : request.status === 'approved' ? 'Approved' : request.status === 'cancelled' ? 'Withdrawn' : 'Declined'}</strong><small>{new Date(request.created_at).toLocaleDateString()}</small><small className="resident-correction-proposal">{proposedChanges}</small>{request.request_note && <small>Note: {request.request_note}</small>}{request.status === 'rejected' && request.review_reason && <small>Review note: {request.review_reason}</small>}</span><div className="row-actions"><StatusPill status={request.status} />{request.status === 'pending' && <button disabled={busy} onClick={() => void cancelCorrection(request.id)}>Withdraw</button>}</div></li>
      })}</ul></div> : null}
    </section>}
    {canReviewChanges.data && profileChanges.data?.some((request) => request.status === 'pending') && <section className="ops-panel resident-correction-panel">
      <div className="ops-panel-heading"><div><h2>Profile correction requests</h2><p>Confirm each correction before updating the official resident record.</p></div><UserRoundPen size={19} /></div>
      <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Resident</th><th>Requested changes</th><th>Submitted</th><th>Decision</th></tr></thead><tbody>
        {profileChanges.data.filter((request) => request.status === 'pending').map((request) => <tr key={request.id}>
          <td><strong>{request.resident ? `${request.resident.first_name} ${request.resident.last_name}` : 'Resident record'}</strong><small>Resident ID · {request.resident_id.slice(0, 8)}</small></td>
          <td>{[request.proposed_first_name && `First name: ${request.proposed_first_name}`, request.proposed_last_name && `Last name: ${request.proposed_last_name}`, request.proposed_phone && `Phone: ${request.proposed_phone}`].filter(Boolean).map((change) => <small key={change}>{change}</small>)}{request.request_note && <small>Note: {request.request_note}</small>}</td>
          <td>{new Date(request.created_at).toLocaleDateString()}</td><td><div className="row-actions"><button onClick={() => void reviewCorrection(request.id, 'approved')}>Approve</button><button className="danger-action" onClick={() => void reviewCorrection(request.id, 'rejected')}>Decline</button></div></td>
        </tr>)}
      </tbody></table></div>
    </section>}
    {formOpen && <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>{canSelfRegister ? 'Your resident profile' : 'New resident record'}</h2><p>Details are visible only to authorized barangay staff and the linked resident.</p></div><Home size={18} /></div>
      <div className="ops-form-grid"><label>First name<input name="firstName" required maxLength={100} /></label><label>Last name<input name="lastName" required maxLength={100} /></label>
        <label>Date of birth <span className="field-hint">Optional</span><input name="birthDate" type="date" max={new Date().toISOString().slice(0, 10)} /></label><label>Phone <span className="field-hint">Optional</span><input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
        {canCreate.data && <label className="span-two">Existing household <span className="field-hint">Optional</span><select name="householdId" defaultValue=""><option value="">Create a new household</option>{households.data?.map((household) => <option key={household.id} value={household.id}>{household.household_code} · {household.address_line}</option>)}</select></label>}
        <label className="span-two">Household address <span className="field-hint">Required for a new household</span><input name="address" maxLength={250} /></label><label>Purok / zone <span className="field-hint">Optional</span><input name="purok" maxLength={100} /></label>
      </div>
      <div className="ops-form-actions"><span className="field-hint">A household record is created with residency status set to pending.</span><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save resident'}</button></div>
    </form>}
    {residents.isPending ? <LoadingNotice /> : residents.error ? <ErrorNotice message={residents.error.message} /> : !residents.data?.length ?
      <div className="ops-empty"><Home size={22} /><strong>No resident records available</strong><p>Records appear here when they are registered for this barangay.</p></div> :
      <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Resident</th><th>Household</th><th>Contact</th><th>Residency</th><th>Record</th></tr></thead><tbody>
        {residents.data.map((resident) => {
          const verification = verifications.data?.find((item) => item.resident_id === resident.id)
          return <tr key={resident.id}><td><strong>{resident.first_name} {resident.last_name}</strong><small>{resident.birth_date ? new Date(resident.birth_date + 'T00:00:00').toLocaleDateString() : 'Birth date not recorded'}</small></td><td>{resident.household?.household_code ?? '—'}<small>{resident.household?.purok ?? resident.household?.address_line ?? 'Address unavailable'}</small></td><td>{resident.phone ?? '—'}</td><td><StatusPill status={verification?.status ?? 'pending'} />{canVerify.data && <div className="row-actions"><button onClick={() => void verify(resident.id, 'verified')}>Verify</button><button onClick={() => void verify(resident.id, 'rejected')}>Reject</button></div>}</td><td><StatusPill status={resident.record_status} /></td></tr>
        })}
      </tbody></table></div>}
    {canCreate.isPending && <LoadingNotice compact />}
  </section>
}

