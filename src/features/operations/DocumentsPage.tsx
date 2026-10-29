import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { FileText, Send } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import {
  createDocumentRequest, hasPermission, listDocumentRequests, listDocumentTypes,
  listResidents, resubmitDocumentRequest, transitionDocumentRequest,
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

export function DocumentsPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const requests = useQuery({ queryKey: ['document-requests', tenantId], queryFn: () => listDocumentRequests(tenantId), enabled: Boolean(tenantId) })
  const types = useQuery({ queryKey: ['document-types', tenantId], queryFn: () => listDocumentTypes(tenantId), enabled: Boolean(tenantId) })
  const residents = useQuery({ queryKey: ['residents', tenantId], queryFn: () => listResidents(tenantId), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'document.request.review'], queryFn: () => hasPermission(tenantId, 'document.request.review'), enabled: Boolean(tenantId) })
  const canIssue = useQuery({ queryKey: ['permission', tenantId, 'document.issue'], queryFn: () => hasPermission(tenantId, 'document.issue'), enabled: Boolean(tenantId) })

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
      form.reset(); setOpen(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit the request.') }
    finally { setBusy(false) }
  }

  async function transition(id: string, next: string) {
    const reason = next === 'rejected' ? window.prompt('Please enter the reason for rejection:') : ''
    if (next === 'rejected' && !reason?.trim()) return
    setError(''); setMessage('')
    try {
      await transitionDocumentRequest(id, next, reason ?? '')
      await queryClient.invalidateQueries({ queryKey: ['document-requests', tenantId] })
      setMessage('Request updated to ' + next.replaceAll('_', ' ') + '.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the request.') }
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
      setMessage('Request resubmitted for review. Its previous rejection remains in the history.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to resubmit the request.') }
  }

  const ownOrAssignedResidents = residents.data ?? []
  return <section className="operation-page">
    <PageHeading title="Document services" description="Track applications through review, approval, issuance, and release.">
      <button className="button primary" onClick={() => setOpen((value) => !value)} disabled={!types.data?.length || !ownOrAssignedResidents.length}><Send size={15} />New request</button>
    </PageHeading>
    {message && <div className="ops-success"><FileText size={16} />{message}</div>}
    {error && <ErrorNotice message={error} />}
    {open && <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>Document request</h2><p>The server validates resident access, document availability, and tenant membership.</p></div><FileText size={18} /></div>
      <div className="ops-form-grid"><label>Resident<select name="residentId" required defaultValue=""><option value="" disabled>Select resident</option>{ownOrAssignedResidents.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name}</option>)}</select></label>
        <label>Document type<select name="typeId" required defaultValue=""><option value="" disabled>Select document</option>{types.data?.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <label className="span-two">Purpose<textarea name="purpose" required minLength={3} maxLength={500} rows={3} placeholder="Explain what the document will be used for." /></label></div>
      <div className="ops-form-actions"><span className="field-hint">Submitting does not automatically approve or issue the document.</span><button className="button primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button></div>
    </form>}
    {types.error && <ErrorNotice message={types.error.message} />}
    <div className="ops-section-title"><h2>Requests</h2><p>Residents see only their own private requests; authorized staff see their tenant queue.</p></div>
    {requests.isPending ? <LoadingNotice /> : requests.error ? <ErrorNotice message={requests.error.message} /> : requests.data?.length ?
      <div className="ops-request-list">{requests.data.map((request) => {
        const isStaff = Boolean(canReview.data || canIssue.data)
        const actions = (isStaff ? transitionActions[request.status] ?? [] : [])
          .filter((action) => action.next === 'issued' || action.next === 'released' ? canIssue.data : canReview.data)
        return <article className="ops-request-card" key={request.id}>
          <div className="request-main"><div className="request-icon"><FileText size={19} /></div><div><strong>{request.document_type?.name ?? 'Barangay document'}</strong><p>{request.resident ? request.resident.first_name + ' ' + request.resident.last_name + ' · ' : ''}{request.purpose}</p><small>Ref {request.reference_number} · {new Date(request.submitted_at).toLocaleDateString()}</small>{request.status === 'rejected' && request.rejection_reason && <small className="rejection-detail">Reason: {request.rejection_reason}</small>}</div></div>
          <div className="request-status"><StatusPill status={request.status} />{actions.map((action) => <button className="text-action" key={action.next} onClick={() => void transition(request.id, action.next)}>{action.label}</button>)}{request.status === 'rejected' && request.resident?.user_id === user?.id && <button className="text-action" onClick={() => void resubmit(request.id, request.purpose)}>Resubmit</button>}</div>
        </article>
      })}</div> : <EmptyNotice title="No document requests" detail="New applications submitted for this barangay will appear here." />}
  </section>
}

