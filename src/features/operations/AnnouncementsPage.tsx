import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Bell, Megaphone } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { createAnnouncement, hasPermission, listAnnouncementAudienceRoles, listAnnouncements, updateAnnouncementStatus } from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(3).max(10000),
  audience: z.enum(['public','residents','officials','role']),
  audience_role_id: z.union([z.string().uuid(), z.literal('')]).optional(),
}).superRefine((value, context) => {
  if (value.audience === 'role' && !value.audience_role_id) context.addIssue({ code: 'custom', path: ['audience_role_id'], message: 'Choose which role should receive this announcement.' })
})

export function AnnouncementsPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const announcements = useQuery({ queryKey: ['announcements', tenantId], queryFn: () => listAnnouncements(tenantId), enabled: Boolean(tenantId) })
  const canPublish = useQuery({ queryKey: ['permission', tenantId, 'announcement.publish'], queryFn: () => hasPermission(tenantId, 'announcement.publish'), enabled: Boolean(tenantId) })
  const audienceRoles = useQuery({ queryKey: ['announcement-audience-roles'], queryFn: listAnnouncementAudienceRoles, enabled: Boolean(canPublish.data) })
  const [open, setOpen] = useState(false)
  const [audience, setAudience] = useState<'public' | 'residents' | 'officials' | 'role'>('public')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    if (!user) return
    const form = event.currentTarget
    const data = new FormData(form)
    const publish = data.get('publish') === 'on'
    const parsed = announcementSchema.safeParse(Object.fromEntries(data.entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the announcement.'); return }
    setBusy(true)
    try {
      await createAnnouncement({
        tenantId, authorId: user.id, title: parsed.data.title, body: parsed.data.body,
        audience: parsed.data.audience,
        audienceRoleId: parsed.data.audience === 'role' ? parsed.data.audience_role_id ?? null : null,
        publish,
      })
      await queryClient.invalidateQueries({ queryKey: ['announcements', tenantId] })
      setMessage(publish
        ? 'Announcement published. In-app notices were created for eligible recipients.'
        : 'Announcement saved as a draft. No notification was created.')
      form.reset(); setAudience('public'); setOpen(false)
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
    <PageHeading title="Announcements" description="Publish clear community updates to residents, officials, or a selected role.">
      {canPublish.data && <button className="button primary" onClick={() => setOpen((value) => !value)}><Megaphone size={16} />Create announcement</button>}
    </PageHeading>
    {canPublish.isPending && <LoadingNotice compact />}
    {canPublish.error && <ErrorNotice message="Announcement publishing access could not be checked. Refresh the page or contact your barangay administrator." />}
    {audienceRoles.error && <ErrorNotice message="The recipient role list could not be loaded. Role-targeted announcements are unavailable until it can be checked." />}
    {message && <div className="ops-success"><Bell size={16} />{message}</div>}
    {error && <ErrorNotice message={error} />}
    {open && canPublish.data && <form className="ops-panel ops-form" onSubmit={(event) => void submit(event)}>
      <div className="ops-panel-heading"><div><h2>New announcement</h2><p>Published posts create in-app notices for eligible recipients. Email and SMS are not configured.</p></div><Megaphone size={18} /></div>
      <div className="ops-form-grid"><label className="span-two">Title<input name="title" required maxLength={180} /></label>
        <label>Audience<select name="audience" value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="public">All barangay members</option><option value="residents">Residents only</option><option value="officials">Barangay officials</option><option value="role">Specific role</option></select></label>
        {audience === 'role' && <label>Recipient role<select name="audience_role_id" required disabled={audienceRoles.isPending}><option value="">Choose a role</option>{audienceRoles.data?.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select><span className="field-hint">Only active members assigned this role can read the post.</span></label>}
        <label className="checkbox-label"><input type="checkbox" name="publish" />Publish now</label>
        <label className="span-two">Message<textarea name="body" rows={5} maxLength={10000} required /></label></div>
      <div className="ops-form-actions"><span className="field-hint">Keep sensitive resident or health details out of public messages.</span><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save announcement'}</button></div>
    </form>}
    <div className="ops-section-title"><h2>Community updates</h2><p>Published messages are visible according to their audience and tenant membership.</p></div>
    {!tenantId ? <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view local announcements." /> : announcements.isPending ? <LoadingNotice /> : announcements.error ? <ErrorNotice message={announcements.error.message} /> : announcements.data?.length ?
      <div className="ops-announcement-list">{announcements.data.map((item) => <article className="ops-panel announcement-card" key={item.id}>
        <div className="announcement-top"><div><StatusPill status={item.status} /><span className="audience-label">{item.audience === 'role' ? `Role: ${audienceRoles.data?.find((role) => role.id === item.audience_role_id)?.label ?? 'selected role'}` : item.audience}</span></div>{canPublish.data && item.status !== 'archived' && <button className="text-action" onClick={() => void setStatus(item.id, item.status === 'published' ? 'archived' : 'published')}>{item.status === 'published' ? 'Archive' : 'Publish'}</button>}</div>
        <h2>{item.title}</h2><p>{item.body}</p><small>{item.published_at ? 'Published ' + new Date(item.published_at).toLocaleString() : 'Draft'}{item.expires_at ? ' · Expires ' + new Date(item.expires_at).toLocaleDateString() : ''}</small>
      </article>)}</div> : <EmptyNotice title="No announcements yet" detail="Published community updates will appear here." />}
  </section>
}

