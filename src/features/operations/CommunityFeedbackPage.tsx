import { useState, type FormEvent } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Check, MessageSquare, Send, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { listCommunityFeedback, listCommunityFeedbackEvents, submitCommunityFeedback, updateCommunityFeedback, type CommunityFeedbackStatus } from './feedback-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const feedbackSchema = z.object({
  category: z.enum(['service','suggestion','accessibility','other']),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(3000),
})

export function CommunityFeedbackPage() {
  const { membership } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const isResident = membership?.role?.key === 'resident'
  const queryClient = useQueryClient()
  const [statusFilter,setStatusFilter] = useState<CommunityFeedbackStatus | 'all'>('all')
  const [searchInput,setSearchInput] = useState('')
  const [search,setSearch] = useState('')
  const canManage = useQuery({ queryKey: ['permission',tenantId,'community.feedback.manage'], queryFn: () => hasPermission(tenantId,'community.feedback.manage'), enabled: Boolean(tenantId) })
  const feedback = useInfiniteQuery({
    queryKey: ['community-feedback',tenantId,statusFilter,search],
    queryFn: ({ pageParam }) => listCommunityFeedback(tenantId,pageParam,statusFilter,search),
    initialPageParam: 0,
    getNextPageParam: (lastPage,_allPages,lastPageParam) => lastPage.length === 100 ? lastPageParam + 1 : undefined,
    enabled: Boolean(tenantId),
  })
  const feedbackItems = feedback.data?.pages.flat() ?? []
  const feedbackIds = feedbackItems.map((item) => item.id)
  const activity = useQuery({
    queryKey: ['community-feedback-events',tenantId,feedbackIds],
    queryFn: () => listCommunityFeedbackEvents(tenantId,feedbackIds),
    enabled: Boolean(tenantId && feedbackIds.length),
  })
  const [formOpen,setFormOpen] = useState(false)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['community-feedback',tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['community-feedback-events',tenantId] }),
    ])
  }
  const activityByFeedback = new Map<string, NonNullable<typeof activity.data>>()
  for (const event of activity.data ?? []) {
    const events = activityByFeedback.get(event.feedback_id) ?? []
    events.push(event)
    activityByFeedback.set(event.feedback_id, events)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = feedbackSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review your feedback.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await submitCommunityFeedback({ tenantId,...parsed.data })
      await refresh(); form.reset(); setFormOpen(false)
      setMessage('Your feedback was submitted privately to the barangay office.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit your feedback.') }
    finally { setBusy(false) }
  }

  async function changeStatus(id: string,status: 'in_review' | 'responded' | 'closed',response = '') {
    if (status === 'closed' && !window.confirm('Close this feedback item? The resident will keep its current status and any response.')) return
    setBusy(true); setError(''); setMessage('')
    try {
      await updateCommunityFeedback(id,status,response)
      await refresh()
      setMessage(status === 'in_review' ? 'Feedback marked for review.' : status === 'responded' ? 'Your response was sent to the resident.' : 'Feedback closed.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update this feedback item.') }
    finally { setBusy(false) }
  }

  async function respond(event: FormEvent<HTMLFormElement>,id: string) {
    event.preventDefault()
    const response = String(new FormData(event.currentTarget).get('response') ?? '').trim()
    const parsed = z.string().min(3).max(2000).safeParse(response)
    if (!parsed.success) { setError('Write a response between 3 and 2000 characters.'); return }
    await changeStatus(id,'responded',parsed.data)
  }

  const emptyTitle = search ? 'No matching feedback' : statusFilter === 'all' ? (isResident ? 'No feedback submitted yet' : 'No resident feedback') : 'No feedback in this status'
  const emptyDetail = search ? 'Try another subject or full feedback reference.' : statusFilter === 'all' ? (isResident ? 'Use Share feedback to send a private message to your barangay office.' : 'Resident submissions will appear here for authorized staff review.') : 'Choose another status to see more feedback.'

  return <section className="operation-page">
    <PageHeading title="Community feedback" description={isResident ? 'Send private feedback to your barangay office and follow its response.' : 'Review resident feedback and send a private response.'}>
      {isResident && <button className="button primary" onClick={() => setFormOpen((open) => !open)}><Send size={15} />{formOpen ? 'Close form' : 'Share feedback'}</button>}
    </PageHeading>
    <div className="ops-panel incident-guidance"><ShieldAlert size={18} /><p><strong>Private, non-emergency channel.</strong> Only you and authorized barangay feedback staff can see your submission. Do not include passwords, health information, or details about another resident. For immediate danger, contact emergency services directly.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view or submit private community feedback." />}
    {Boolean(tenantId) && canManage.isPending && <LoadingNotice compact />}
    {canManage.error && <ErrorNotice message="Feedback review access could not be checked. Residents can still view and submit their own feedback; staff review controls are hidden until access can be verified." />}
    {message && <div className="ops-success"><Check size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {formOpen && isResident && <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}><div className="ops-panel-heading"><div><h2>Send feedback</h2><p>Your account stays private to the designated barangay reviewers.</p></div><MessageSquare size={19} /></div>
      <div className="ops-form-grid"><label>Topic<select name="category"><option value="service">Barangay service</option><option value="suggestion">Suggestion</option><option value="accessibility">Accessibility</option><option value="other">Other</option></select></label>
        <label className="span-two">Subject<input name="subject" required minLength={3} maxLength={160} /></label>
        <label className="span-two">Your feedback<textarea name="message" required minLength={10} maxLength={3000} rows={5} placeholder="Describe your experience or suggestion. Please do not include sensitive information." /></label></div>
      <div className="ops-form-actions"><span className="field-hint">Your feedback is not an emergency report and does not guarantee an immediate response.</span><button className="button primary" disabled={busy}>{busy ? 'Sending…' : 'Submit privately'}</button></div>
    </form>}
    <form className="community-feedback-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()) }}>
      <label htmlFor="feedback-search">Search subject or full reference</label><input id="feedback-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={160} placeholder="Enter a subject or feedback reference" />
      <button className="button outline" type="submit">Search</button>{search && <button className="text-action" type="button" onClick={() => { setSearch(''); setSearchInput('') }}>Clear search</button>}
    </form>
    <div className="community-feedback-filter"><label htmlFor="feedback-status-filter">Show feedback</label><select id="feedback-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CommunityFeedbackStatus | 'all')}><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="in_review">In review</option><option value="responded">Responded</option><option value="closed">Closed</option></select></div>
    {!tenantId ? null : feedback.isPending ? <LoadingNotice /> : feedback.error ? <ErrorNotice message={feedback.error.message} /> : feedbackItems.length ? <><div className="community-feedback-list">{feedbackItems.map((item) => <article className="ops-panel community-feedback-card" key={item.id}>
      <header><div><StatusPill status={item.status} /><span>{item.category.replaceAll('_',' ')}</span></div><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></header>
      <small className="community-feedback-reference">Feedback ref {item.id.toUpperCase()}</small><h2>{item.subject}</h2><p className="community-feedback-message">{item.message}</p>
      {(activityByFeedback.get(item.id)?.length ?? 0) > 0 && <details className="community-feedback-history"><summary>Activity history ({activityByFeedback.get(item.id)?.length})</summary><ol>{activityByFeedback.get(item.id)?.map((event) => <li key={event.id}><span>{event.action === 'review_started' ? 'Review started' : event.action === 'responded' ? 'Response sent' : event.action === 'closed' ? 'Feedback closed' : 'Feedback submitted'}</span><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></li>)}</ol></details>}
      {item.staff_response && <div className="community-feedback-response"><strong>Barangay office response</strong><p>{item.staff_response}</p>{item.responded_at && <time dateTime={item.responded_at}>{new Date(item.responded_at).toLocaleString()}</time>}</div>}
      {canManage.data && <div className="community-feedback-actions">
        {item.status === 'submitted' && <button className="button outline" disabled={busy} onClick={() => void changeStatus(item.id,'in_review')}>Start review</button>}
        {item.status === 'in_review' && <form className="community-feedback-response-form" onSubmit={(event) => void respond(event,item.id)}><label>Private response<textarea name="response" required minLength={3} maxLength={2000} rows={3} placeholder="Write a helpful response" /></label><button className="button primary" disabled={busy}>{busy ? 'Sending…' : 'Send response'}</button></form>}
        {item.status !== 'closed' && <button className="text-action" disabled={busy} onClick={() => void changeStatus(item.id,'closed')}>Close feedback</button>}
      </div>}
    </article>)}</div>{feedback.hasNextPage && <button className="button outline feedback-load-more" disabled={feedback.isFetchingNextPage} onClick={() => void feedback.fetchNextPage()}>{feedback.isFetchingNextPage ? 'Loading…' : 'Load older feedback'}</button>}</> : <EmptyNotice title={emptyTitle} detail={emptyDetail} />}
  </section>
}
