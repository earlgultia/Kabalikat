import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Bell, Megaphone } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { createAnnouncement, hasPermission, listAnnouncements, updateAnnouncementStatus } from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(3).max(10000),
  audience: z.enum(['public','residents','officials']),
})

export function AnnouncementsPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const announcements = useQuery({ queryKey: ['announcements', tenantId], queryFn: () => listAnnouncements(tenantId), enabled: Boolean(tenantId) })
  const canPublish = useQuery({ queryKey: ['permission', tenantId, 'announcement.publish'], queryFn: () => hasPermission(tenantId, 'announcement.publish'), enabled: Boolean(tenantId) })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    if (!user) return
    const form = event.currentTarget
    const data = new FormData(form)
    const parsed = announcementSchema.safeParse(Object.fromEntries(data.entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the announcement.'); return }
    setBusy(true)
    try {
      await createAnnouncement({
        tenantId, authorId: user.id, title: parsed.data.title, body: parsed.data.body,
        audience: parsed.data.audience, publish: data.get('publish') === 'on',
      })
      await queryClient.invalidateQueries({ queryKey: ['announcements', tenantId] })
      setMessage('Announcement saved. Delivery status is not claimed by this app.')
      form.reset(); setOpen(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save the announcement.') }
    finally { setBusy(false) }
  }

  async function setStatus(id: string, status: 'published' | 'archived') {
    setError('')
    try {
      await updateAnnouncementStatus(id, status)
      await queryClient.invalidateQueries({ queryKey: ['announcements', tenantId] })
      setMessage(status === 'published' ? 'Announcement published.' : 'Announcement archived.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update announcement.') }
  }

  return <section className="operation-page">
    <PageHeading title="Announcements" description="Publish clear community updates to residents or officials.">
      {canPublish.data && <button className="button primary" onClick={() => setOpen((value) => !value)}><Megaphone size={16} />Create announcement</button>}
    </PageHeading>
    {message && <div className="ops-success"><Bell size={16} />{message}</div>}
    {error && <ErrorNotice message={error} />}
    {open && canPublish.data && <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>New announcement</h2><p>Notifications are not sent until an email or SMS provider is configured.</p></div><Megaphone size={18} /></div>
      <div className="ops-form-grid"><label className="span-two">Title<input name="title" required maxLength={180} /></label>
        <label>Audience<select name="audience" defaultValue="public"><option value="public">Public community update</option><option value="residents">Residents</option><option value="officials">Barangay officials</option></select></label>
        <label className="checkbox-label"><input type="checkbox" name="publish" />Publish now</label>
        <label className="span-two">Message<textarea name="body" rows={5} maxLength={10000} required /></label></div>
      <div className="ops-form-actions"><span className="field-hint">Keep sensitive resident or health details out of public messages.</span><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save announcement'}</button></div>
    </form>}
    <div className="ops-section-title"><h2>Community updates</h2><p>Published messages are visible according to their audience and tenant membership.</p></div>
    {announcements.isPending ? <LoadingNotice /> : announcements.error ? <ErrorNotice message={announcements.error.message} /> : announcements.data?.length ?
      <div className="ops-announcement-list">{announcements.data.map((item) => <article className="ops-panel announcement-card" key={item.id}>
        <div className="announcement-top"><div><StatusPill status={item.status} /><span className="audience-label">{item.audience}</span></div>{canPublish.data && item.status !== 'archived' && <button className="text-action" onClick={() => void setStatus(item.id, item.status === 'published' ? 'archived' : 'published')}>{item.status === 'published' ? 'Archive' : 'Publish'}</button>}</div>
        <h2>{item.title}</h2><p>{item.body}</p><small>{item.published_at ? 'Published ' + new Date(item.published_at).toLocaleString() : 'Draft'}{item.expires_at ? ' · Expires ' + new Date(item.expires_at).toLocaleDateString() : ''}</small>
      </article>)}</div> : <EmptyNotice title="No announcements yet" detail="Published community updates will appear here." />}
  </section>
}

