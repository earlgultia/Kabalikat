import { useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileLock2, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import {
  createResidentIdentitySignedUrl,
  listMyResidentIdentitySubmissions,
  listPendingResidentIdentitySubmissions,
  reviewResidentIdentity,
  submitResidentIdentityDocuments,
} from './resident-identity-data'
import { ErrorNotice, LoadingNotice, StatusPill } from './shared'
import { formatDateTime } from './format'

export function ResidentIdentityDocuments({ barangayId, residentId }: { barangayId: string; residentId: string }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const uploadInFlight = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const submissions = useQuery({
    queryKey: ['resident-identity-own', user?.id ?? 'signed-out', residentId],
    queryFn: () => listMyResidentIdentitySubmissions(residentId),
  })
  const latest = submissions.data?.[0]

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const front = (form.elements.namedItem('front') as HTMLInputElement | null)?.files?.[0]
    const back = (form.elements.namedItem('back') as HTMLInputElement | null)?.files?.[0]
    if (!front || !back) { setError('Upload both the front and back of your ID.'); return }
    if (uploadInFlight.current) return
    uploadInFlight.current = true
    setBusy(true); setError(''); setMessage('')
    try {
      await submitResidentIdentityDocuments({ barangayId, residentId, front, back })
      await queryClient.invalidateQueries({ queryKey: ['resident-identity-own', user?.id ?? 'signed-out', residentId] })
      form.reset()
      setMessage('Your ID was submitted securely for review.')
    } catch (err) { setError(err instanceof Error ? err.message : 'The ID could not be submitted. Try again.') }
    finally { uploadInFlight.current = false; setBusy(false) }
  }

  return <section id="resident-identity-panel" tabIndex={-1} className="ops-panel resident-identity-panel">
    <div className="ops-panel-heading"><div><h2>Identity verification</h2><p>Upload the front and back of your National ID or another valid ID for important barangay services.</p></div><FileLock2 size={19} /></div>
    <p className="resident-identity-privacy"><ShieldCheck size={16} />Only you and authorized Captain or Secretary reviewers can access these private files. They are not shown to other residents.</p>
    {submissions.isPending ? <LoadingNotice compact /> : submissions.error ? <ErrorNotice message="Your ID submission status could not be loaded." userFacingMessage onRetry={() => void submissions.refetch()} retrying={submissions.isFetching} /> : <>
      {latest && <div className="resident-identity-status"><StatusPill status={latest.status} />{latest.created_at && <small>Submitted {formatDateTime(latest.created_at)}</small>}{latest.status === 'rejected' && latest.review_note && <p>Reviewer note: {latest.review_note}</p>}</div>}
      {latest?.status === 'pending' && <p className="field-hint">Your files are waiting for an authorized reviewer.</p>}
      {latest?.status === 'verified' && <p className="field-hint">Your identity documents have been verified.</p>}
      {latest?.status === 'rejected' && <p className="field-hint">New access to these scans is blocked, and they are queued for deletion. A link opened before rejection may work for up to 60 seconds. You can upload a corrected copy below.</p>}
      {latest?.status !== 'verified' && latest?.status !== 'pending' && <form className="ops-form resident-identity-upload" onSubmit={(event) => void submit(event)}>
        <label>Front of ID<input name="front" type="file" accept="application/pdf,image/jpeg,image/png" required /></label>
        <label>Back of ID<input name="back" type="file" accept="application/pdf,image/jpeg,image/png" required /></label>
        <p className="field-hint">Both sides are required before you can request barangay documents. PDF, JPEG, or PNG; up to 10 MB per side.</p>
        {error && <p className="ops-error" role="alert">{error}</p>}
        {message && <p className="ops-success" role="status">{message}</p>}
        <button className="button primary" disabled={busy}>{busy ? 'Uploading securely...' : latest?.status === 'rejected' ? 'Resubmit ID' : 'Submit ID for review'}</button>
      </form>}
    </>}
  </section>
}

export function ResidentIdentityReviewQueue({ barangayId }: { barangayId: string }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const queue = useQuery({
    queryKey: ['resident-identity-review-queue', user?.id ?? 'signed-out', barangayId, page],
    queryFn: () => listPendingResidentIdentitySubmissions(barangayId, page),
  })
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [rejectingId, setRejectingId] = useState('')
  const [rejectionNote, setRejectionNote] = useState('')

  async function openDocument(path: string) {
    setError('')
    const preview = window.open('about:blank', '_blank')
    if (!preview) { setError('Allow pop-ups to view the private ID file.'); return }
    preview.opener = null
    try { preview.location.replace(await createResidentIdentitySignedUrl(path)) }
    catch (err) { preview.close(); setError(err instanceof Error ? err.message : 'The private ID file could not be opened.') }
  }

  async function decide(id: string, decision: 'verified' | 'rejected', note = '') {
    setBusyId(id); setError('')
    try {
      await reviewResidentIdentity(id, decision, note)
      setPage(0)
      setRejectingId('')
      setRejectionNote('')
      await queryClient.invalidateQueries({ queryKey: ['resident-identity-review-queue', user?.id ?? 'signed-out', barangayId] })
      await queryClient.invalidateQueries({ queryKey: ['resident-identity-own'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The ID review could not be saved.')
      await queryClient.invalidateQueries({ queryKey: ['resident-identity-review-queue', user?.id ?? 'signed-out', barangayId] })
    }
    finally { setBusyId('') }
  }

  return <section className="ops-panel resident-identity-panel">
    <div className="ops-panel-heading"><div><h2>Private resident ID review</h2><p>Review these files only for a legitimate barangay service or residency matter.</p></div><FileLock2 size={19} /></div>
    {error && <p className="ops-error" role="alert">{error}</p>}
    {queue.isPending ? <LoadingNotice compact /> : queue.error ? <ErrorNotice message="Private ID review queue could not be loaded." userFacingMessage onRetry={() => void queue.refetch()} retrying={queue.isFetching} /> : !queue.data?.items.length ? <p className="field-hint">{page ? 'No more ID submissions on this page.' : 'No ID submissions are waiting for review.'}</p> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Resident</th><th>Submitted</th><th>Private files</th><th>Review</th></tr></thead><tbody>
      {queue.data.items.map((submission) => <tr key={submission.id}>
        <td>{submission.resident ? `${submission.resident.first_name} ${submission.resident.last_name}` : 'Resident'}<small>Identity documents are confidential.</small></td>
        <td>{formatDateTime(submission.created_at)}</td>
        <td><div className="row-actions"><button type="button" onClick={() => void openDocument(submission.front_storage_path)}>View front</button><button type="button" onClick={() => void openDocument(submission.back_storage_path)}>View back</button></div></td>
        <td>{rejectingId === submission.id ? <form className="ops-form resident-identity-reject-form" onSubmit={(event) => { event.preventDefault(); void decide(submission.id, 'rejected', rejectionNote.trim()) }}>
          <label htmlFor={`identity-rejection-note-${submission.id}`}>What should the resident correct?
            <textarea id={`identity-rejection-note-${submission.id}`} rows={3} minLength={3} maxLength={500} required value={rejectionNote} onChange={(event) => setRejectionNote(event.target.value)} />
          </label>
          <div className="row-actions"><button className="danger-action" disabled={busyId === submission.id || rejectionNote.trim().length < 3}>{busyId === submission.id ? 'Saving…' : 'Confirm rejection'}</button><button type="button" disabled={busyId === submission.id} onClick={() => { setRejectingId(''); setRejectionNote('') }}>Cancel</button></div>
        </form> : <div className="row-actions"><button disabled={busyId === submission.id} onClick={() => void decide(submission.id, 'verified')}>Verify</button><button className="danger-action" disabled={busyId === submission.id} onClick={() => { setError(''); setRejectingId(submission.id); setRejectionNote('') }}>Reject</button></div>}</td>
      </tr>)}
    </tbody></table></div>}
    <div className="row-actions resident-identity-pagination">
      <button type="button" disabled={page === 0 || queue.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
      <span className="field-hint">Page {page + 1}</span>
      <button type="button" disabled={!queue.data?.hasNextPage || queue.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button>
    </div>
  </section>
}
