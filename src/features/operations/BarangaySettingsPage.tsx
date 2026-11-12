import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Clock3, FileSignature, MapPin, Save, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from './format'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading } from './shared'

const settingsSchema = z.object({
  office_address: z.string().trim().max(300),
  public_contact_phone: z.string().trim().max(40),
  public_contact_email: z.union([z.literal(''), z.email()]).refine((value) => value.length <= 254),
  office_hours: z.string().trim().max(300),
  document_signatory_name: z.string().trim().max(120),
  document_signatory_title: z.string().trim().max(120),
}).refine((value) => !value.document_signatory_name || value.document_signatory_title, {
  path: ['document_signatory_title'], message: 'Add the signatory title or clear the signatory name.',
}).refine((value) => !value.document_signatory_title || value.document_signatory_name, {
  path: ['document_signatory_name'], message: 'Add the signatory name or clear the signatory title.',
})

type OfficeSettings = z.infer<typeof settingsSchema>
type SettingsEvent = { id: string; changed_fields: string[]; created_at: string }
const blankSettings: OfficeSettings = {
  office_address: '', public_contact_phone: '', public_contact_email: '', office_hours: '',
  document_signatory_name: '', document_signatory_title: '',
}
const fieldLabels: Record<string, string> = {
  office_address: 'Office address', public_contact_phone: 'Public phone', public_contact_email: 'Public email',
  office_hours: 'Office hours', document_signatory_name: 'Signatory name', document_signatory_title: 'Signatory title',
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function loadSettings(barangayId: string) {
  const { data, error } = await client().from('barangay_office_settings')
    .select('office_address,public_contact_phone,public_contact_email,office_hours,document_signatory_name,document_signatory_title,updated_at')
    .eq('barangay_id', barangayId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { ...blankSettings, ...data } : blankSettings
}

async function loadHistory(barangayId: string): Promise<SettingsEvent[]> {
  const { data, error } = await client().from('barangay_office_settings_events')
    .select('id,changed_fields,created_at').eq('barangay_id', barangayId)
    .order('created_at', { ascending: false }).limit(12)
  if (error) throw new Error(error.message)
  return (data ?? []) as SettingsEvent[]
}

export function BarangaySettingsPage() {
  const { membership } = useAuth()
  const barangayId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const permission = useQuery({
    queryKey: ['permission', barangayId, 'tenant.settings.manage'],
    queryFn: async () => {
      const { data, error } = await client().rpc('has_tenant_permission', { p_barangay_id: barangayId, p_permission: 'tenant.settings.manage' })
      if (error) throw new Error(error.message)
      return data === true
    }, enabled: Boolean(barangayId),
  })
  const settings = useQuery({ queryKey: ['barangay-office-settings', barangayId], queryFn: () => loadSettings(barangayId), enabled: Boolean(barangayId && permission.data) })
  const history = useQuery({ queryKey: ['barangay-office-settings-history', barangayId], queryFn: () => loadHistory(barangayId), enabled: Boolean(barangayId && permission.data) })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(''); setSuccess('')
    const parsed = settingsSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the office details and try again.'); return }
    setBusy(true)
    try {
      const { error: saveError } = await client().rpc('update_barangay_office_settings', {
        p_barangay_id: barangayId,
        p_office_address: parsed.data.office_address,
        p_public_contact_phone: parsed.data.public_contact_phone,
        p_public_contact_email: parsed.data.public_contact_email,
        p_office_hours: parsed.data.office_hours,
        p_document_signatory_name: parsed.data.document_signatory_name,
        p_document_signatory_title: parsed.data.document_signatory_title,
      })
      if (saveError) throw saveError
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['barangay-office-settings', barangayId] }),
        queryClient.invalidateQueries({ queryKey: ['barangay-office-settings-history', barangayId] }),
      ])
      setSuccess('Barangay office settings saved and recorded in the activity history.')
    } catch { setError('Unable to save these settings. Check that all fields are valid and you still have Captain access.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Barangay office settings" description="Maintain public office contacts and the name and title printed for document signatories." />
    {!barangayId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active Captain membership to configure the barangay office." />}
    {permission.isPending && barangayId && <LoadingNotice compact />}
    {permission.error && <ErrorNotice message="Office settings permission could not be checked. Refresh and try again." onRetry={() => void permission.refetch()} retrying={permission.isFetching} />}
    {permission.data === false && <div className="ops-panel"><strong>Office settings are restricted</strong><p>Your current role cannot change barangay office settings.</p></div>}
    {permission.data && <>
      <div className="ops-panel member-access-guidance"><ShieldCheck size={18} /><p>These settings are limited to this barangay. The signatory fields store a printed name and title only; they do not create or store a digital signature.</p></div>
      {settings.isPending ? <LoadingNotice /> : settings.error ? <ErrorNotice message="Barangay office settings could not be loaded." onRetry={() => void settings.refetch()} retrying={settings.isFetching} /> : <form className="ops-panel ops-form barangay-settings-form" onSubmit={(event) => void save(event)}>
        <div className="ops-panel-heading"><div><h2>Office and document details</h2><p>Keep contact information current so residents know when and how to reach the barangay.</p></div><MapPin size={19} /></div>
        <div className="ops-form-grid">
          <label className="span-two">Office address<textarea name="office_address" rows={2} maxLength={300} defaultValue={settings.data?.office_address ?? ''} placeholder="Barangay hall street or location" /></label>
          <label>Public contact phone<input name="public_contact_phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={settings.data?.public_contact_phone ?? ''} placeholder="Contact number" /></label>
          <label>Public contact email<input name="public_contact_email" type="email" autoComplete="email" maxLength={254} defaultValue={settings.data?.public_contact_email ?? ''} placeholder="office@example.gov.ph" /></label>
          <label className="span-two">Office hours<textarea name="office_hours" rows={2} maxLength={300} defaultValue={settings.data?.office_hours ?? ''} placeholder="For example: Monday–Friday, 8:00 AM–5:00 PM" /></label>
        </div>
        <div className="ops-panel-heading barangay-settings-subheading"><div><h2>Document signatory</h2><p>Printed details for templates that support an authorized signatory.</p></div><FileSignature size={19} /></div>
        <div className="ops-form-grid">
          <label>Printed name<input name="document_signatory_name" maxLength={120} defaultValue={settings.data?.document_signatory_name ?? ''} placeholder="Authorized signatory name" /></label>
          <label>Official title<input name="document_signatory_title" maxLength={120} defaultValue={settings.data?.document_signatory_title ?? ''} placeholder="For example: Punong Barangay" /></label>
        </div>
        {error && <ErrorNotice message={error} />}
        {success && <div className="ops-success" role="status">{success}</div>}
        <div className="ops-form-actions"><span className="field-hint">Each save records which fields changed.</span><button className="button primary" disabled={busy || settings.isPending}><Save size={15} />{busy ? 'Saving…' : 'Save office settings'}</button></div>
      </form>}
      <section className="ops-panel member-access-history barangay-settings-history"><div className="ops-panel-heading"><div><h2>Recent settings activity</h2><p>Names of changed fields are recorded without storing prior values.</p></div><Clock3 size={18} /></div>
        {history.isPending ? <LoadingNotice compact /> : history.error ? <ErrorNotice message="Office settings history could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} /> : history.data?.length ? <ol>{history.data.map((entry) => <li key={entry.id}><div><strong>{entry.changed_fields.map((field) => fieldLabels[field] ?? field).join(', ')}</strong></div><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></li>)}</ol> : <p className="field-hint">No settings changes have been recorded.</p>}
      </section>
    </>}
  </section>
}
