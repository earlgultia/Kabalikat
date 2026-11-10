import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { BookOpen, CheckCircle2, Headset, MessageCircle, Search, Send, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { addSupportMessage, createSupportTicket, getPlatformSupportAttentionCount, getPlatformSupportQueueSummary, getSupportTicketById, listPlatformSupportTickets, listSupportEvents, listSupportMessages, listSupportTickets, reopenOwnResolvedSupportTicket, setSupportTicketStatus, SUPPORT_THREAD_PAGE_SIZE, type SupportTicket } from './support-data'
import { ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const ticketSchema = z.object({ category: z.enum(['account','bug','data','question','other']), subject: z.string().trim().min(3).max(180), description: z.string().trim().min(3).max(4000) })
const statuses = ['new','in_progress','waiting_on_requester','resolved','closed']

function SupportTicketDetails({ ticket, platformAdmin, currentUserId, busy, autoOpenConversation = false, onConversationFocused, onReply, onReopen }: {
  ticket: SupportTicket; platformAdmin: boolean; currentUserId: string; busy: boolean
  autoOpenConversation?: boolean
  onConversationFocused?: () => void
  onReply: (ticket: SupportTicket, event: FormEvent<HTMLFormElement>) => void
  onReopen: (ticket: SupportTicket, event: FormEvent<HTMLFormElement>) => void
}) {
  const [conversationOpen, setConversationOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [reopenFormOpen, setReopenFormOpen] = useState(false)
  const conversationRef = useRef<HTMLDetailsElement>(null)
  const messages = useInfiniteQuery({ queryKey: ['support-messages', ticket.id], queryFn: ({ pageParam }) => listSupportMessages(ticket.id, pageParam), initialPageParam: 0, getNextPageParam: (lastPage, allPages) => allPages.length * SUPPORT_THREAD_PAGE_SIZE < lastPage.total ? allPages.length : undefined, enabled: conversationOpen })
  const events = useInfiniteQuery({ queryKey: ['support-events', ticket.id], queryFn: ({ pageParam }) => listSupportEvents(ticket.id, pageParam), initialPageParam: 0, getNextPageParam: (lastPage, allPages) => allPages.length * SUPPORT_THREAD_PAGE_SIZE < lastPage.total ? allPages.length : undefined, enabled: historyOpen })
  const messageItems = messages.data?.pages.flatMap((page) => page.items).reverse() ?? []
  const eventItems = events.data?.pages.flatMap((page) => page.items).reverse() ?? []
  const messageCount = messages.data?.pages[0]?.total ?? 0
  const eventCount = events.data?.pages[0]?.total ?? 0
  const displayAuthor = (authorId: string) => authorId === currentUserId ? 'You' : platformAdmin ? 'Requester' : 'Support team'

  useEffect(() => {
    if (!autoOpenConversation) return
    setConversationOpen(true)
    conversationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    conversationRef.current?.querySelector('summary')?.focus({ preventScroll: true })
    onConversationFocused?.()
  }, [autoOpenConversation, onConversationFocused])

  return <>
    <details ref={conversationRef} className="support-conversation" open={conversationOpen} onToggle={(event) => setConversationOpen(event.currentTarget.open)}><summary><MessageCircle size={15} /> Conversation{messages.isPending ? '' : messages.error ? '' : ` (${messageCount})`}</summary>
      {conversationOpen && messages.isPending && <p className="field-hint" role="status">Loading conversation…</p>}
      {conversationOpen && messages.error && <p className="ops-error" role="alert">Conversation could not be loaded. Reopen this section or refresh the page.</p>}
      {conversationOpen && !messages.isPending && !messages.error && messageCount === 0 && <p className="field-hint">No messages have been added to this request yet.</p>}
      {conversationOpen && !messages.isPending && !messages.error && Boolean(messageItems.length) && <><ol>{messageItems.map((entry) => <li className={entry.visibility === 'internal' ? 'support-internal-note' : ''} key={entry.id}><div><strong>{entry.visibility === 'internal' ? 'Internal note' : displayAuthor(entry.author_id)}</strong><span>{formatDateTime(entry.created_at)}</span></div><p>{entry.body}</p></li>)}</ol>{messages.hasNextPage && <button type="button" className="button outline" disabled={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>{messages.isFetchingNextPage ? 'Loading older messages…' : 'Load older messages'}</button>}</>}
      {(platformAdmin || !['resolved','closed'].includes(ticket.status)) && <form className="support-reply-form" onSubmit={(event) => onReply(ticket, event)}><label>{platformAdmin ? 'Reply or add a note' : 'Reply to support'}<textarea name="body" maxLength={4000} rows={3} required /></label>{platformAdmin && <label className="support-internal-toggle"><input type="checkbox" name="internal" /> Internal note visible to platform administrators only</label>}<button className="button outline" disabled={busy}><Send size={14} />Send</button></form>}
    </details>
    {!platformAdmin && ticket.status === 'resolved' && <div className="support-reopen">
      {!reopenFormOpen ? <><p>This request is resolved. If the issue is still ongoing, you can reopen it and add an update.</p><button type="button" className="button outline" disabled={busy} onClick={() => setReopenFormOpen(true)}>Reopen request</button></> : <form className="support-reopen-form" onSubmit={(event) => onReopen(ticket, event)}>
        <label>Why does this request need more help?<textarea name="reopenMessage" maxLength={4000} minLength={3} rows={3} required /></label>
        <div><button type="button" className="button outline" disabled={busy} onClick={() => setReopenFormOpen(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Reopening…' : 'Reopen request'}</button></div>
      </form>}
    </div>}
    {!platformAdmin && ticket.status === 'closed' && <p className="support-closed-note">This request is closed. Submit a new request if you need further help.</p>}
    <details className="incident-history" onToggle={(event) => setHistoryOpen(event.currentTarget.open)}><summary>Status history{events.isPending ? '' : events.error ? '' : ` (${eventCount})`}</summary>
      {historyOpen && events.isPending && <p className="field-hint" role="status">Loading status history…</p>}
      {historyOpen && events.error && <p className="ops-error" role="alert">Status history could not be loaded. Reopen this section or refresh the page.</p>}
      {historyOpen && !events.isPending && !events.error && eventCount === 0 && <p className="field-hint">No status history is available.</p>}
      {historyOpen && !events.isPending && !events.error && Boolean(eventItems.length) && <><ol>{eventItems.map((entry) => <li key={entry.id}><strong>{entry.action === 'ticket_created' ? 'Request opened' : `Status changed: ${entry.from_status?.replaceAll('_',' ')} → ${entry.to_status?.replaceAll('_',' ')}`}</strong><span>{formatDateTime(entry.created_at)}</span></li>)}</ol>{events.hasNextPage && <button type="button" className="button outline" disabled={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()}>{events.isFetchingNextPage ? 'Loading older history…' : 'Load older history'}</button>}</>}
    </details>
  </>
}

export function SupportPage({ platformAdmin = false, focusId, onFocusHandled }: { platformAdmin?: boolean; focusId?: string; onFocusHandled?: () => void }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [needsAttention, setNeedsAttention] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const queryKey = ['support-tickets', platformAdmin ? 'platform' : tenantId, statusFilter, search, needsAttention]
  const tickets = useInfiniteQuery({ queryKey, queryFn: ({ pageParam }) => platformAdmin ? listPlatformSupportTickets(pageParam, statusFilter, search, needsAttention) : listSupportTickets(tenantId, pageParam, statusFilter, search), initialPageParam: 0, getNextPageParam: (lastPage, _pages, lastPageParam) => lastPage.length === 50 ? lastPageParam + 1 : undefined, enabled: platformAdmin || Boolean(tenantId) })
  const queueSummary = useQuery({ queryKey: ['platform-support-queue-summary'], queryFn: getPlatformSupportQueueSummary, enabled: platformAdmin, staleTime: 30_000 })
  const attentionCount = useQuery({ queryKey: ['platform-support-attention-count'], queryFn: getPlatformSupportAttentionCount, enabled: platformAdmin, staleTime: 30_000 })
  const focusedTicket = useQuery({ queryKey: ['support-ticket-focus', focusId], queryFn: () => getSupportTicketById(focusId!), enabled: Boolean(focusId), staleTime: 30_000 })
  const ticketItems = tickets.data?.pages.flat() ?? []
  const visibleTicketItems = focusedTicket.data && !ticketItems.some((ticket) => ticket.id === focusedTicket.data?.id) ? [focusedTicket.data, ...ticketItems] : ticketItems
  const [showForm, setShowForm] = useState(false)
  const [busyTicket, setBusyTicket] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey }), queryClient.invalidateQueries({ queryKey: ['support-messages'] }), queryClient.invalidateQueries({ queryKey: ['support-events'] })])
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = ticketSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the request details.'); return }
    setBusyTicket('new'); setError(''); setMessage('')
    try { await createSupportTicket(tenantId, parsed.data.category, parsed.data.subject, parsed.data.description); await refresh(); form.reset(); setShowForm(false); setMessage('Support request submitted.') }
    catch { setError('Unable to submit the support request. Please try again.') }
    finally { setBusyTicket('') }
  }

  async function reply(ticket: SupportTicket, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const body = String(formData.get('body') ?? '').trim()
    const internal = platformAdmin && formData.get('internal') === 'on'
    if (body.length < 1 || body.length > 4000) { setError('Messages must be between 1 and 4000 characters.'); return }
    setBusyTicket(ticket.id); setError(''); setMessage('')
    try { await addSupportMessage(ticket.id, body, internal); await refresh(); form.reset(); setMessage(internal ? 'Internal note added.' : 'Reply sent.') }
    catch { setError('Unable to send the reply. The request may be closed or your access may have changed.') }
    finally { setBusyTicket('') }
  }

  async function reopen(ticket: SupportTicket, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const body = String(formData.get('reopenMessage') ?? '').trim()
    if (body.length < 3 || body.length > 4000) { setError('Please explain the update in 3 to 4000 characters.'); return }
    setBusyTicket(ticket.id); setError(''); setMessage('')
    try { await reopenOwnResolvedSupportTicket(ticket.id, body); await refresh(); form.reset(); setMessage('Request reopened. The support team can continue helping you.') }
    catch { setError('Unable to reopen this request. It may have changed status or your access may have changed.') }
    finally { setBusyTicket('') }
  }

  async function changeStatus(ticketId: string, status: string) {
    setBusyTicket(ticketId); setError(''); setMessage('')
    try { await setSupportTicketStatus(ticketId, status); await refresh(); setMessage('Support request status updated.') }
    catch { setError('Unable to update the request status.') }
    finally { setBusyTicket('') }
  }

  const openCount = ticketItems.filter((ticket) => !['resolved','closed'].includes(ticket.status)).length
  return <section className="operation-page">
    <PageHeading title={platformAdmin ? 'Support queue' : 'Help & support'} description={platformAdmin ? 'Review support requests from barangay workspaces.' : 'Send a private request to the KABALIKAT support team and follow replies.'}>
      {!platformAdmin && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}>New support request</button>}
    </PageHeading>
    {platformAdmin ? <div className="support-summary support-queue-summary" aria-label="Support queue status filters">
      {[
        { label: 'All requests', status: 'all', count: queueSummary.data?.total_count },
        { label: 'New', status: 'new', count: queueSummary.data?.new_count },
        { label: 'In progress', status: 'in_progress', count: queueSummary.data?.in_progress_count },
        { label: 'Waiting on requester', status: 'waiting_on_requester', count: queueSummary.data?.waiting_on_requester_count },
        { label: 'Resolved', status: 'resolved', count: queueSummary.data?.resolved_count },
        { label: 'Closed', status: 'closed', count: queueSummary.data?.closed_count },
      ].map((item) => <button type="button" className={!needsAttention && statusFilter === item.status ? 'active' : ''} aria-pressed={!needsAttention && statusFilter === item.status} key={item.status} onClick={() => { setNeedsAttention(false); setStatusFilter(item.status) }}><strong>{queueSummary.isPending ? '—' : (item.count ?? 0).toLocaleString()}</strong><span>{item.label}</span></button>)}
      <button type="button" className={needsAttention ? 'active attention-filter' : 'attention-filter'} aria-pressed={needsAttention} onClick={() => { setNeedsAttention((active) => !active); setStatusFilter('all') }}><strong>{attentionCount.isPending ? '—' : (attentionCount.data ?? 0).toLocaleString()}</strong><span>Needs attention · 3+ days</span></button>
      {queueSummary.error && <p className="support-summary-error" role="alert">Queue totals could not be loaded. The request list is still available.</p>}
      {attentionCount.error && <p className="support-summary-error" role="alert">The needs-attention count could not be loaded.</p>}
    </div> : <div className="support-summary"><div><strong>{ticketItems.length.toLocaleString()}</strong><span>Requests loaded</span></div><div><strong>{openCount.toLocaleString()}</strong><span>Open in loaded requests</span></div></div>}
    <section className="ops-panel support-guidance" aria-labelledby="support-guidance-title">
      <div className="support-guidance-heading"><BookOpen size={18} /><div><h2 id="support-guidance-title">Quick help</h2><p>{platformAdmin ? 'Safe, consistent ways to handle platform support requests.' : 'A few tips to get the right help while protecting your information.'}</p></div></div>
      <div className="support-guidance-list">
        {platformAdmin ? <>
          <details><summary>Write a useful public reply</summary><p>Explain the next step in plain language. Keep replies focused on the request and avoid including another barangay’s or resident’s private details.</p></details>
          <details><summary>Use internal notes carefully</summary><p>Internal notes are visible only to platform administrators. Do not store passwords, authentication codes, or unnecessary resident information in a note.</p></details>
          <details><summary>Update status as work progresses</summary><p>Use status history to track handoffs. Requesters can reopen a resolved request with an explanation; closed requests remain closed.</p></details>
        </> : <>
          <details><summary>Account or invitation problem?</summary><p>Open the invitation link and use the email address it was sent to. Create an account if you are new, or choose “Already have an account? Sign in.” If email confirmation is requested, confirm it and return to the invitation link. Signing in from the invitation link accepts it automatically; if you were already signed in when you opened the link, choose “Accept invitation.” Creating an account alone does not grant barangay access. The invitation remains pending until accepted.</p></details>
          <details><summary>Describe the issue clearly</summary><p>Include the page, what you expected, what happened, and the steps to reproduce it. Never include passwords, sign-in codes, government ID numbers, or private resident or health details.</p></details>
          <details><summary>Follow replies and request status</summary><p>Open a request’s conversation to read replies and its status history to see updates. You can reopen a resolved request with an explanation if you still need help. In-app notification preferences are available under Account Security; some service updates remain enabled.</p></details>
        </>}
      </div>
      <p className="support-guidance-privacy"><ShieldAlert size={15} />This support queue is not an emergency channel. For immediate danger, contact local emergency services or barangay officials directly.</p>
    </section>
    <form className="support-ticket-controls" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()) }}>{needsAttention && <p className="support-attention-hint">Showing new or in-progress requests with no activity for at least 3 days.</p>}<label className="support-search-field"><Search size={16} /><input aria-label="Search support request subjects" maxLength={180} placeholder="Search request subjects" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label><label className="support-status-field">Status<select aria-label="Filter support requests by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label><button className="button outline support-search-submit" type="submit">Search</button>{search && <button className="text-action support-search-clear" type="button" onClick={() => { setSearch(''); setSearchInput('') }}>Clear search</button>}</form>
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {showForm && !platformAdmin && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>Contact support</h2><p>Do not include passwords, government ID numbers, or sensitive resident information.</p></div><Headset size={19} /></div><div className="ops-form-grid"><label>Topic<select name="category"><option value="account">Account access</option><option value="bug">Something is not working</option><option value="data">Record or data question</option><option value="question">How do I…?</option><option value="other">Other</option></select></label><label className="span-two">Subject<input name="subject" minLength={3} maxLength={180} required /></label><label className="span-two">Describe the issue<textarea name="description" minLength={3} maxLength={4000} rows={5} required /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busyTicket === 'new'}>Send request</button></div></form>}
    {tickets.isPending && <LoadingNotice />}{tickets.error && <ErrorNotice message="Unable to load support requests. Please try again later." />}
    {focusedTicket.error && <ErrorNotice message="The support request from this update could not be opened. It may no longer be available to your account." />}
    {visibleTicketItems.length === 0 && !tickets.isPending && !tickets.error && !focusedTicket.isPending && <div className="ops-empty"><Headset size={22} /><strong>{needsAttention ? 'No requests need attention' : platformAdmin ? 'No support requests' : 'No requests yet'}</strong><p>{needsAttention ? 'No new or in-progress requests have been quiet for 3 or more days.' : platformAdmin ? 'New requests will appear in this queue.' : 'Your support requests and replies will appear here.'}</p></div>}
    <div className="support-ticket-list">{visibleTicketItems.map((ticket) => {
      return <article className="ops-panel support-ticket" key={ticket.id}>
        <header><div><StatusPill status={ticket.status} /><span className="support-category">{ticket.category.replace('_',' ')}</span></div>{platformAdmin && <small>{ticket.barangay_name ?? `Barangay ${ticket.barangay_id.slice(0,8)}`}</small>}</header>
        <h2>{ticket.subject}</h2><p className="support-ticket-description">{ticket.description}</p>
        <div className="incident-meta"><span>Opened {formatDateTime(ticket.created_at)}</span><span>Updated {formatDateTime(ticket.updated_at)}</span></div>
        {platformAdmin && <label className="support-status-control">Request status<select value={ticket.status} disabled={busyTicket === ticket.id} onChange={(event) => void changeStatus(ticket.id, event.target.value)}>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label>}
        <SupportTicketDetails ticket={ticket} platformAdmin={platformAdmin} currentUserId={user?.id ?? ''} busy={busyTicket === ticket.id} autoOpenConversation={!platformAdmin && focusId === ticket.id} onConversationFocused={onFocusHandled} onReply={reply} onReopen={reopen} />
      </article>
    })}</div>
    {tickets.hasNextPage && <button type="button" className="button outline feedback-load-more" disabled={tickets.isFetchingNextPage} onClick={() => void tickets.fetchNextPage()}>{tickets.isFetchingNextPage ? 'Loading…' : 'Load older support requests'}</button>}
  </section>
}
