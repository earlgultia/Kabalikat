import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, Headset, MessageCircle, Send } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { addSupportMessage, createSupportTicket, listSupportEvents, listSupportMessages, listSupportTickets, setSupportTicketStatus, type SupportTicket } from './support-data'
import { ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const ticketSchema = z.object({ category: z.enum(['account','bug','data','question','other']), subject: z.string().trim().min(3).max(180), description: z.string().trim().min(3).max(4000) })
const statuses = ['new','in_progress','waiting_on_requester','resolved','closed']

export function SupportPage({ platformAdmin = false }: { platformAdmin?: boolean }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const queryKey = ['support-tickets', platformAdmin ? 'platform' : tenantId]
  const tickets = useQuery({ queryKey, queryFn: () => listSupportTickets(platformAdmin ? undefined : tenantId), enabled: platformAdmin || Boolean(tenantId) })
  const ticketIds = tickets.data?.map((ticket) => ticket.id) ?? []
  const messages = useQuery({ queryKey: ['support-messages', ...ticketIds], queryFn: () => listSupportMessages(ticketIds), enabled: ticketIds.length > 0 })
  const events = useQuery({ queryKey: ['support-events', ...ticketIds], queryFn: () => listSupportEvents(ticketIds), enabled: ticketIds.length > 0 })
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

  async function changeStatus(ticketId: string, status: string) {
    setBusyTicket(ticketId); setError(''); setMessage('')
    try { await setSupportTicketStatus(ticketId, status); await refresh(); setMessage('Support request status updated.') }
    catch { setError('Unable to update the request status.') }
    finally { setBusyTicket('') }
  }

  const openCount = tickets.data?.filter((ticket) => !['resolved','closed'].includes(ticket.status)).length ?? 0
  const displayAuthor = (authorId: string) => authorId === user?.id ? 'You' : platformAdmin ? 'Requester' : 'Support team'

  return <section className="operation-page">
    <PageHeading title={platformAdmin ? 'Support queue' : 'Help & support'} description={platformAdmin ? 'Review support requests from barangay workspaces.' : 'Send a private request to the KABALIKAT support team and follow replies.'}>
      {!platformAdmin && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}>New support request</button>}
    </PageHeading>
    <div className="support-summary"><div><strong>{tickets.data?.length ?? 0}</strong><span>{platformAdmin ? 'All requests' : 'Your requests'}</span></div><div><strong>{openCount}</strong><span>Open</span></div></div>
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {showForm && !platformAdmin && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>Contact support</h2><p>Do not include passwords, government ID numbers, or sensitive resident information.</p></div><Headset size={19} /></div><div className="ops-form-grid"><label>Topic<select name="category"><option value="account">Account access</option><option value="bug">Something is not working</option><option value="data">Record or data question</option><option value="question">How do I…?</option><option value="other">Other</option></select></label><label className="span-two">Subject<input name="subject" minLength={3} maxLength={180} required /></label><label className="span-two">Describe the issue<textarea name="description" minLength={3} maxLength={4000} rows={5} required /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busyTicket === 'new'}>Send request</button></div></form>}
    {tickets.isPending && <LoadingNotice />}{tickets.error && <ErrorNotice message="Unable to load support requests. Please try again later." />}
    {tickets.data?.length === 0 && <div className="ops-empty"><Headset size={22} /><strong>{platformAdmin ? 'No support requests' : 'No requests yet'}</strong><p>{platformAdmin ? 'New requests will appear in this queue.' : 'Your support requests and replies will appear here.'}</p></div>}
    <div className="support-ticket-list">{tickets.data?.map((ticket) => {
      const ticketMessages = messages.data?.filter((entry) => entry.ticket_id === ticket.id) ?? []
      const ticketEvents = events.data?.filter((entry) => entry.ticket_id === ticket.id) ?? []
      return <article className="ops-panel support-ticket" key={ticket.id}>
        <header><div><StatusPill status={ticket.status} /><span className="support-category">{ticket.category.replace('_',' ')}</span></div>{platformAdmin && <small>Barangay {ticket.barangay_id.slice(0,8)}</small>}</header>
        <h2>{ticket.subject}</h2><p className="support-ticket-description">{ticket.description}</p>
        <div className="incident-meta"><span>Opened {formatDateTime(ticket.created_at)}</span><span>Updated {formatDateTime(ticket.updated_at)}</span></div>
        {platformAdmin && <label className="support-status-control">Request status<select value={ticket.status} disabled={busyTicket === ticket.id} onChange={(event) => void changeStatus(ticket.id, event.target.value)}>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label>}
        <details className="support-conversation" open><summary><MessageCircle size={15} /> Conversation ({ticketMessages.length})</summary>
          <ol>{ticketMessages.map((entry) => <li className={entry.visibility === 'internal' ? 'support-internal-note' : ''} key={entry.id}><div><strong>{entry.visibility === 'internal' ? 'Internal note' : displayAuthor(entry.author_id)}</strong><span>{formatDateTime(entry.created_at)}</span></div><p>{entry.body}</p></li>)}</ol>
          {(platformAdmin || !['resolved','closed'].includes(ticket.status)) && <form className="support-reply-form" onSubmit={(event) => void reply(ticket, event)}><label>{platformAdmin ? 'Reply or add a note' : 'Reply to support'}<textarea name="body" maxLength={4000} rows={3} required /></label>{platformAdmin && <label className="support-internal-toggle"><input type="checkbox" name="internal" /> Internal note visible to platform administrators only</label>}<button className="button outline" disabled={busyTicket === ticket.id}><Send size={14} />Send</button></form>}
        </details>
        <details className="incident-history"><summary>Status history ({ticketEvents.length})</summary><ol>{ticketEvents.map((entry) => <li key={entry.id}><strong>{entry.action === 'ticket_created' ? 'Request opened' : `Status changed: ${entry.from_status?.replaceAll('_',' ')} → ${entry.to_status?.replaceAll('_',' ')}`}</strong><span>{formatDateTime(entry.created_at)}</span></li>)}</ol></details>
      </article>
    })}</div>
  </section>
}
