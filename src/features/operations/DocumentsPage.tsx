import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Check, FileText, History, ListChecks, Send, Settings2 } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import {
  createDocumentRequest, createDocumentType, hasPermission, listDocumentRequestActivity, listDocumentRequestsPage, listDocumentTypeActivity, listDocumentTypes, revokeIssuedDocument,
  listResidents, resubmitDocumentRequest, transitionDocumentRequest, updateDocumentType, type DocumentRequestRow, type DocumentTypeRow, DOCUMENT_REQUEST_PAGE_SIZE,
} from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const requestSchema = z.object({
  residentId: z.string().uuid(),
  typeId: z.string().uuid(),
  purpose: z.string().trim().min(3).max(500),
})
const transitionActions: Record<string, Array<{ label: string; next: string }>> = {
  pending: [{ label: 'Start review', next: 'under_review' }, { label: 'Reject', next: 'rejected' }],
  under_review: [{ label: 'Await approval', next: 'awaiting_approval' }, { label: 'Approve', next: 'approved' }, { label: 'Reject', next: 'rejected' }],
  awaiting_approval: [{ label: 'Approve', next: 'approved' }, { label: 'Reject', next: 'rejected' }],
  approved: [{ label: 'Issue document', next: 'issued' }],
  issued: [{ label: 'Mark released', next: 'released' }],
}

type DocumentTypeValues = { code: string; name: string; description: string; requirements: string[]; publicRequestEnabled: boolean }

function DocumentTypeEditor({ item, busy, onSave, onCancel }: {
  item?: DocumentTypeRow; busy: boolean; onSave: (values: DocumentTypeValues) => Promise<void>; onCancel: () => void
}) {
  const [formError, setFormError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError('')
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    const name = String(values.name ?? '').trim()
    const description = String(values.description ?? '').trim()
    const code = item?.code ?? String(values.code ?? '').trim().toUpperCase()
    const requirements = String(values.requirements ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (!item && !/^[A-Z][A-Z0-9_]{1,39}$/.test(code)) { setFormError('Use a unique code with 2–40 uppercase letters, numbers, or underscores.'); return }
    if (name.length < 2 || name.length > 120) { setFormError('Name must be between 2 and 120 characters.'); return }
    if (description.length > 500) { setFormError('Description cannot exceed 500 characters.'); return }
    if (requirements.length > 12 || requirements.some((line) => line.length > 200) || new Set(requirements.map((line) => line.toLocaleLowerCase())).size !== requirements.length) {
      setFormError('Add at most 12 distinct items, each no longer than 200 characters.')
      return
    }
    try {
      await onSave({ code, name, description, requirements, publicRequestEnabled: new FormData(form).has('publicRequestEnabled') })
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Unable to save this document type.') }
  }
  return <form className="document-type-editor" onSubmit={(event) => void submit(event)}>
    {!item && <label>Internal code<input name="code" required maxLength={40} placeholder="BARANGAY_CLEARANCE" autoCapitalize="characters" /></label>}
    <label>Document name<input name="name" required maxLength={120} defaultValue={item?.name} /></label>
    <label>Description<textarea name="description" maxLength={500} rows={2} defaultValue={item?.description} placeholder="Briefly describe this document" /></label>
    <label>What applicants should bring <span className="field-hint">One item per line, up to 12. These are instructions only; files are not collected here.</span><textarea name="requirements" rows={4} maxLength={2600} defaultValue={item?.requirements.join('\n')} placeholder="Proof of identity\nProof of residency" /></label>
    <label className="document-type-enabled"><input type="checkbox" name="publicRequestEnabled" defaultChecked={item?.public_request_enabled ?? true} />Residents can request this document online</label>
    {formError && <p className="account-security-error" role="alert">{formError}</p>}
    <div className="ops-form-actions"><button type="button" className="button outline" onClick={onCancel} disabled={busy}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : item ? 'Save changes' : 'Add document type'}</button></div>
  </form>
}

export function DocumentsPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const isResident = membership?.role?.key === 'resident'
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [manageTypesOpen, setManageTypesOpen] = useState(false)
  const [createTypeOpen, setCreateTypeOpen] = useState(false)
  const [editTypeId, setEditTypeId] = useState<string | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [requestSearch, setRequestSearch] = useState('')
  const [debouncedRequestSearch, setDebouncedRequestSearch] = useState('')
  const [requestPage, setRequestPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedRequestSearch(requestSearch); setRequestPage(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [requestSearch])
  const requests = useQuery({
    queryKey: ['document-requests', tenantId, requestPage, debouncedRequestSearch, statusFilter],
    queryFn: () => listDocumentRequestsPage(tenantId, requestPage, debouncedRequestSearch, statusFilter),
    enabled: Boolean(tenantId),
  })
  const canReadRequests = useQuery({ queryKey: ['permission', tenantId, 'document.request.read'], queryFn: () => hasPermission(tenantId, 'document.request.read'), enabled: Boolean(tenantId) })
  const visibleRequestIds = requests.data?.requests.map((request) => request.id) ?? []
  const activity = useQuery({
    queryKey: ['document-request-activity', tenantId, visibleRequestIds],
    queryFn: () => listDocumentRequestActivity(tenantId, visibleRequestIds),
    enabled: Boolean(tenantId && visibleRequestIds.length && (canReadRequests.data || (isResident && requests.data?.requests.some((request) => request.resident?.user_id === user?.id)))),
  })
  const types = useQuery({ queryKey: ['document-types', tenantId], queryFn: () => listDocumentTypes(tenantId), enabled: Boolean(tenantId) })
  const residents = useQuery({ queryKey: ['residents', tenantId], queryFn: () => listResidents(tenantId), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'document.request.review'], queryFn: () => hasPermission(tenantId, 'document.request.review'), enabled: Boolean(tenantId) })
  const canIssue = useQuery({ queryKey: ['permission', tenantId, 'document.issue'], queryFn: () => hasPermission(tenantId, 'document.issue'), enabled: Boolean(tenantId) })
  const canManageTypes = useQuery({ queryKey: ['permission', tenantId, 'document.type.manage'], queryFn: () => hasPermission(tenantId, 'document.type.manage'), enabled: Boolean(tenantId) })
  const typeActivity = useQuery({ queryKey: ['document-type-activity', tenantId], queryFn: () => listDocumentTypeActivity(tenantId), enabled: Boolean(tenantId && canManageTypes.data === true) })
  const enabledTypes = types.data?.filter((type) => type.public_request_enabled) ?? []
  const selectedType = enabledTypes.find((type) => type.id === selectedTypeId)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    const form = event.currentTarget
    const parsed = requestSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the request details.'); return }
    setBusy(true)
    try {
      const created = await createDocumentRequest(tenantId, parsed.data.residentId, parsed.data.typeId, parsed.data.purpose)
      setMessage('Request submitted. Reference number: ' + created.reference_number)
      await queryClient.invalidateQueries({ queryKey: ['document-requests', tenantId] })
      await queryClient.invalidateQueries({ queryKey: ['document-request-activity', tenantId] })
      form.reset(); setOpen(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit the request.') }
    finally { setBusy(false) }
  }

  async function transition(id: string, next: string) {
    if (next === 'cancelled' && !window.confirm('Withdraw this pending document request?')) return
    const reason = next === 'rejected' ? window.prompt('Please enter the reason for rejection:') : ''
    if (next === 'rejected' && !reason?.trim()) return
    setError(''); setMessage(''); setBusy(true)
    try {
      await transitionDocumentRequest(id, next, reason ?? '')
      await queryClient.invalidateQueries({ queryKey: ['document-requests', tenantId] })
      await queryClient.invalidateQueries({ queryKey: ['document-request-activity', tenantId] })
      setMessage(next === 'cancelled' ? 'Pending request withdrawn.' : 'Request updated to ' + next.replaceAll('_', ' ') + '.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the request.') }
    finally { setBusy(false) }
  }

  async function resubmit(id: string, currentPurpose: string) {
    const purpose = window.prompt('Review or update the purpose before resubmitting:', currentPurpose)
    if (!purpose?.trim()) return
    const parsed = z.string().trim().min(3).max(500).safeParse(purpose)
    if (!parsed.success) { setError('Purpose must be between 3 and 500 characters.'); return }
    setError(''); setMessage('')
    try {
      await resubmitDocumentRequest(id, parsed.data)
      await queryClient.invalidateQueries({ queryKey: ['document-requests', tenantId] })
      await queryClient.invalidateQueries({ queryKey: ['document-request-activity', tenantId] })
      setMessage('Request resubmitted for review. Its previous rejection remains in the history.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to resubmit the request.') }
  }

  async function revoke(id: string) {
    const reason = window.prompt('Reason for revoking this issued document (3–1000 characters):')?.trim() ?? ''
    if (reason.length < 3 || reason.length > 1000) return
    if (!window.confirm('Revoke this issuance record? Its verification status will change to revoked.')) return
    setError(''); setMessage(''); setBusy(true)
    try {
      await revokeIssuedDocument(id, reason)
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['document-requests', tenantId] }), queryClient.invalidateQueries({ queryKey: ['document-request-activity', tenantId] })])
      setMessage('Issued document revoked. The reason is saved in its history.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to revoke the issued document.') }
    finally { setBusy(false) }
  }

  async function saveDocumentType(values: DocumentTypeValues) {
    setBusy(true)
    try {
      if (editTypeId) {
        await updateDocumentType({ typeId: editTypeId, name: values.name, description: values.description, requirements: values.requirements, publicRequestEnabled: values.publicRequestEnabled })
        setMessage('Document type updated.')
      } else {
        await createDocumentType({ tenantId, ...values })
        setMessage('Document type added.')
      }
      await queryClient.invalidateQueries({ queryKey: ['document-types', tenantId] })
      setCreateTypeOpen(false); setEditTypeId(null)
    } finally { setBusy(false) }
  }

  function downloadRequestReceipt(request: DocumentRequestRow) {
    const contents = [
      'KABALIKAT — DOCUMENT APPLICATION RECEIPT',
      'This confirms an application was recorded. It is not an issued document.',
      '',
      `Reference number: ${request.reference_number}`,
      `Document type: ${request.document_type?.name ?? 'Barangay document'}`,
      `Submitted: ${new Date(request.submitted_at).toLocaleString()}`,
      `Current status: ${request.status.replaceAll('_', ' ')}`,
      `Purpose: ${request.purpose}`,
      '',
      'Keep this reference number private and provide it to barangay staff when asking about this request.',
    ].join('\n')
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `kabalikat-receipt-${request.reference_number}.txt`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const ownOrAssignedResidents = residents.data ?? []
  const visibleRequests = requests.data?.requests ?? []
  return <section className="operation-page">
    <PageHeading title="Document services" description="Track applications through review, approval, issuance, and release.">
      {canManageTypes.data && <button className="button outline" onClick={() => setManageTypesOpen((value) => !value)}><Settings2 size={16} />{manageTypesOpen ? 'Close document setup' : 'Manage document types'}</button>}
      <button className="button primary" onClick={() => { setOpen((value) => !value); setSelectedTypeId('') }} disabled={!enabledTypes.length || !ownOrAssignedResidents.length}><Send size={15} />New request</button>
    </PageHeading>
    {message && <div className="ops-success"><FileText size={16} />{message}</div>}
    {error && <ErrorNotice message={error} />}
    {(canReadRequests.error || canReview.error || canIssue.error || canManageTypes.error) && <ErrorNotice message="Some document service permissions could not be checked. Related staff controls remain hidden until access can be verified; refresh the page or contact your barangay administrator." />}
    {isResident && <section className="ops-panel document-type-management" aria-labelledby="resident-document-catalog-title">
      <div className="ops-panel-heading"><div><h2 id="resident-document-catalog-title">Documents you can request</h2><p>Review the purpose and what to bring before starting an application.</p></div><ListChecks size={19} /></div>
      {types.isPending ? <LoadingNotice compact /> : types.error ? <ErrorNotice message={types.error.message} /> : enabledTypes.length ? <div className="document-type-list">{enabledTypes.map((type) => <article key={type.id}>
        <div><strong>{type.name}</strong>{type.description && <p>{type.description}</p>}{type.requirements.length > 0 ? <><small>Bring these items to the barangay office:</small><ul>{type.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul></> : <small>Check with the barangay office about any supporting items.</small>}</div>
      </article>)}</div> : <EmptyNotice title="Online requests are not available yet" detail="Please contact your barangay office for current document services." />}
      {enabledTypes.length > 0 && <p className="field-hint">This page does not collect supporting files. The barangay office will explain any in-person steps.</p>}
    </section>}
    {open && <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>Document request</h2><p>The server validates resident access, document availability, and tenant membership.</p></div><FileText size={18} /></div>
      <div className="ops-form-grid"><label>Resident<select name="residentId" required defaultValue=""><option value="" disabled>Select resident</option>{ownOrAssignedResidents.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name}</option>)}</select></label>
        <label>Document type<select name="typeId" required value={selectedTypeId} onChange={(event) => setSelectedTypeId(event.currentTarget.value)}><option value="" disabled>Select document</option>{enabledTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        {selectedType && <div className="document-type-info span-two"><strong>{selectedType.name}</strong>{selectedType.description && <p>{selectedType.description}</p>}{selectedType.requirements.length > 0 && <><span>Bring these items to the barangay office:</span><ul>{selectedType.requirements.map((requirement) => <li key={requirement}><Check size={14} />{requirement}</li>)}</ul></>}<small>Supporting files are not uploaded through this request form.</small></div>}
        <label className="span-two">Purpose<textarea name="purpose" required minLength={3} maxLength={500} rows={3} placeholder="Explain what the document will be used for." /></label></div>
      <div className="ops-form-actions"><span className="field-hint">Submitting does not automatically approve or issue the document.</span><button className="button primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button></div>
    </form>}
    {manageTypesOpen && canManageTypes.data && <section className="ops-panel document-type-management">
      <div className="ops-panel-heading"><div><h2>Document types and requirements</h2><p>Manage the list residents can request and the instructions they see before applying.</p></div><ListChecks size={19} /></div>
      {!createTypeOpen && !editTypeId && <button className="button outline" onClick={() => setCreateTypeOpen(true)}>Add document type</button>}
      {createTypeOpen && <DocumentTypeEditor key="new-document-type" busy={busy} onSave={saveDocumentType} onCancel={() => setCreateTypeOpen(false)} />}
      <details className="document-type-audit"><summary>Configuration change history</summary>
        {typeActivity.isPending ? <LoadingNotice compact /> : typeActivity.error ? <ErrorNotice message={typeActivity.error.message} /> : typeActivity.data?.length ? <ol>{typeActivity.data.map((entry) => <li key={entry.activity_id}>
          <div><strong>{entry.document_type_name} · {entry.action}</strong><small>{entry.actor_name} · {new Date(entry.created_at).toLocaleString()}</small></div>
          <details><summary>View recorded values</summary><div className="document-type-audit-values">{entry.previous_values && <div><strong>Before</strong><pre>{JSON.stringify(entry.previous_values, null, 2)}</pre></div>}<div><strong>After</strong><pre>{JSON.stringify(entry.new_values, null, 2)}</pre></div></div></details>
        </li>)}</ol> : <p className="field-hint">No document type changes have been recorded yet.</p>}
      </details>
      {types.error && <ErrorNotice message={types.error.message} />}
      {types.isPending ? <LoadingNotice compact /> : <div className="document-type-list">{(types.data ?? []).map((type) => <article key={type.id}>
        {editTypeId === type.id ? <DocumentTypeEditor key={type.id} item={type} busy={busy} onSave={saveDocumentType} onCancel={() => setEditTypeId(null)} /> : <>
          <div><strong>{type.name}</strong><small>{type.code} · {type.public_request_enabled ? 'Available to residents' : 'Not available online'}</small>{type.description && <p>{type.description}</p>}{type.requirements.length > 0 && <ul>{type.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>}</div>
          <button className="text-action" onClick={() => { setCreateTypeOpen(false); setEditTypeId(type.id) }}>Edit type</button>
        </>}
      </article>)}</div>}
    </section>}
    {types.error && <ErrorNotice message={types.error.message} />}
    <div className="ops-section-title"><h2>Requests</h2><p>Residents see only their own private requests; authorized staff see their tenant queue.</p></div>
    {tenantId && <div className="incident-filters"><label>Search requests<input type="search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Reference, resident, purpose, or document" /></label><label>Filter requests by status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setRequestPage(0) }}><option value="all">All requests</option>{['pending', 'under_review', 'awaiting_approval', 'approved', 'rejected', 'issued', 'released', 'cancelled'].map((status) => <option value={status} key={status}>{status.replaceAll('_', ' ')}</option>)}</select></label></div>}
    {!tenantId ? <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view document services and requests." /> : requests.isPending ? <LoadingNotice /> : requests.error ? <ErrorNotice message={requests.error.message} /> : requests.data?.total ? visibleRequests.length ?
      <div className="ops-request-list">{visibleRequests.map((request) => {
        const isStaff = Boolean(canReview.data || canIssue.data)
        const requestEvents = activity.data?.filter((entry) => entry.request_id === request.id) ?? []
        const residentGuidance: Record<string, string> = {
          pending: 'Your application is in the queue and waiting for staff review.',
          under_review: 'Barangay staff are checking your application.',
          awaiting_approval: 'The review is complete and your application is waiting for final approval.',
          approved: 'Your application is approved. The document still needs to be prepared and issued.',
          issued: 'Your document has been issued and is waiting for release by the barangay office.',
          released: 'Your document has been released. Keep the original in a safe place.',
          rejected: 'Your application was declined. Review the reason above and contact the barangay office if you need help.',
          cancelled: 'This request was withdrawn and will not continue. You can submit a new request if needed.',
        }
        const actions = (isStaff ? transitionActions[request.status] ?? [] : [])
          .filter((action) => action.next === 'issued' || action.next === 'released' ? canIssue.data : canReview.data)
        return <article className="ops-request-card" key={request.id}>
          <div className="request-main"><div className="request-icon"><FileText size={19} /></div><div><strong>{request.document_type?.name ?? 'Barangay document'}</strong><p>{request.resident ? request.resident.first_name + ' ' + request.resident.last_name + ' · ' : ''}{request.purpose}</p><small>Ref {request.reference_number} · {new Date(request.submitted_at).toLocaleDateString()}</small>{request.status === 'rejected' && request.rejection_reason && <small className="rejection-detail">Reason: {request.rejection_reason}</small>}{request.issued && <div className="issued-document-meta"><strong>Issuance {request.issued.issuance_number}</strong><span>Recorded {new Date(request.issued.issued_at).toLocaleString()}</span>{request.issued.expires_at && <span>Expires {new Date(request.issued.expires_at).toLocaleDateString()}</span>}<span>Verification status: {request.issued.verification_status}</span>{request.issued.events?.map((event) => <span className="rejection-detail" key={event.id}>Revoked {new Date(event.created_at).toLocaleString()}: {event.reason}</span>)}</div>}</div></div>
          {request.resident?.user_id === user?.id && residentGuidance[request.status] && <p className="resident-request-guidance">{residentGuidance[request.status]}</p>}
          <div className="request-status"><StatusPill status={request.status} />{request.resident?.user_id === user?.id && <button className="text-action" onClick={() => downloadRequestReceipt(request)}>Download receipt</button>}{actions.map((action) => <button className="text-action" key={action.next} disabled={busy} onClick={() => void transition(request.id, action.next)}>{action.label}</button>)}{canIssue.data && request.issued?.verification_status === 'valid' && <button className="text-action danger-action" disabled={busy} onClick={() => void revoke(request.id)}>Revoke issuance</button>}{request.status === 'pending' && request.resident?.user_id === user?.id && <button className="text-action" disabled={busy} onClick={() => void transition(request.id, 'cancelled')}>Withdraw request</button>}{request.status === 'rejected' && request.resident?.user_id === user?.id && <button className="text-action" disabled={busy} onClick={() => void resubmit(request.id, request.purpose)}>Resubmit</button>}</div>
          {request.resident?.user_id === user?.id && requestEvents.length > 0 && <div className="resident-document-timeline" aria-label="Your request status history"><strong><History size={14} />Status updates</strong><ol>{[...requestEvents].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((entry) => <li key={`${entry.request_id}-${entry.to_status}-${entry.created_at}`}><span>{entry.to_status.replaceAll('_', ' ')}</span><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></li>)}</ol><small>Only status and time are shown here. Contact the barangay office if you need help with a decision.</small></div>}
          {requestEvents.length > 0 && request.resident?.user_id !== user?.id && <details className="document-request-history"><summary><History size={14} />Request history</summary><ol>{[...requestEvents].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((entry) => <li key={`${entry.request_id}-${entry.to_status}-${entry.created_at}`}><span><strong>{entry.from_status ? `${entry.from_status.replaceAll('_', ' ')} → ` : ''}${entry.to_status.replaceAll('_', ' ')}</strong><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></span><small>{entry.actor_name}{entry.reason ? ` · ${entry.reason}` : ''}</small></li>)}</ol></details>}
        </article>
      })}</div> : <EmptyNotice title="No requests on this page" detail="Try another status or return to a previous page." /> : <EmptyNotice title={requestSearch || statusFilter !== 'all' ? 'No requests match these filters' : 'No document requests'} detail={requestSearch || statusFilter !== 'all' ? 'Try another search term or choose a different status.' : 'New applications submitted for this barangay will appear here.'} />}
    {requests.data && requests.data.total > DOCUMENT_REQUEST_PAGE_SIZE && <nav className="ops-form-actions" aria-label="Document request pages">
      <button className="button outline" disabled={requestPage === 0 || requests.isFetching} onClick={() => setRequestPage((current) => Math.max(0, current - 1))}>Previous</button>
      <span className="field-hint">Page {requestPage + 1} of {Math.ceil(requests.data.total / DOCUMENT_REQUEST_PAGE_SIZE)}</span>
      <button className="button outline" disabled={(requestPage + 1) * DOCUMENT_REQUEST_PAGE_SIZE >= requests.data.total || requests.isFetching} onClick={() => setRequestPage((current) => current + 1)}>Next</button>
    </nav>}
  </section>
}

