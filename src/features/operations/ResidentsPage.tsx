import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Check, Home, UserPlus } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission, listHouseholds, listResidents, listResidencyVerifications, registerResident, verifyResident } from './data'
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
  const residents = useQuery({ queryKey: ['residents', tenantId], queryFn: () => listResidents(tenantId), enabled: Boolean(tenantId) })
  const households = useQuery({ queryKey: ['households', tenantId], queryFn: () => listHouseholds(tenantId), enabled: Boolean(tenantId) })
  const verifications = useQuery({ queryKey: ['residency-verifications', tenantId], queryFn: () => listResidencyVerifications(tenantId), enabled: Boolean(tenantId) })
  const canCreate = useQuery({ queryKey: ['permission', tenantId, 'resident.create'], queryFn: () => hasPermission(tenantId, 'resident.create'), enabled: Boolean(tenantId) })
  const canVerify = useQuery({ queryKey: ['permission', tenantId, 'resident.verify'], queryFn: () => hasPermission(tenantId, 'resident.verify'), enabled: Boolean(tenantId) })
  const canSelfRegister = role === 'resident' && residents.data?.length === 0

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

  return <section className="operation-page">
    <PageHeading title="Residents & households" description="Maintain barangay resident records and household associations with role-controlled access.">
      {(canCreate.data || canSelfRegister) && <button className="button primary" onClick={() => setFormOpen((open) => !open)}><UserPlus size={16} />{canSelfRegister ? 'Register my household' : 'Add resident'}</button>}
    </PageHeading>
    {message && <div className="ops-success"><Check size={16} />{message}</div>}
    {errorMessage && <ErrorNotice message={errorMessage} />}
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

