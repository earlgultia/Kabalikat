import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarHeart, CheckCircle2, MapPin, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { completeHealthCampaign, createHealthCampaign, listHealthCampaigns, reviewHealthCampaign, type HealthCampaign } from './health-outreach-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const campaignSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), location: z.string().trim().min(2).max(240), starts: z.string().min(1), ends: z.string().min(1) })

export function HealthOutreachPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'health.campaign.manage'], queryFn: () => hasPermission(tenantId, 'health.campaign.manage'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'health.campaign.review'], queryFn: () => hasPermission(tenantId, 'health.campaign.review'), enabled: Boolean(tenantId) })
  const campaigns = useQuery({ queryKey: ['health-outreach-campaigns', tenantId], queryFn: () => listHealthCampaigns(tenantId), enabled: Boolean(tenantId) })
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const canAccess = canManage.data || canReview.data

  async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: ['health-outreach-campaigns', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-calendar', tenantId] }), queryClient.invalidateQueries({ queryKey: ['community-calendar-preview', tenantId] })]) }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = campaignSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the campaign details.'); return }
    const startsAt = new Date(parsed.data.starts), endsAt = new Date(parsed.data.ends)
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError('The end time must be after the start time.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await createHealthCampaign({ barangayId: tenantId, title: parsed.data.title, description: parsed.data.description, location: parsed.data.location, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })
      await refresh(); form.reset(); setShowForm(false); setMessage('Outreach schedule sent for Captain review.')
    } catch { setError('Unable to create the outreach schedule. Check the details and try again.') }
    finally { setBusy(false) }
  }
  async function act(campaign: HealthCampaign, action: 'approve' | 'reject' | 'complete') {
    let note: string | null = null
    if (action === 'reject') {
      note = window.prompt('Reason for returning this schedule (3–1000 characters):')?.trim() ?? ''
      if (note.length < 3 || note.length > 1000) return
    } else if (action === 'complete' && !window.confirm('Mark this completed outreach schedule as finished?')) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (action === 'complete') await completeHealthCampaign(campaign.id)
      else await reviewHealthCampaign(campaign.id, action === 'approve', note)
      await refresh(); setMessage(action === 'approve' ? 'Outreach schedule published.' : action === 'reject' ? 'Schedule returned with a reason.' : 'Outreach schedule marked complete.')
    } catch { setError('Unable to update this schedule. Refresh and try again.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Health outreach" description="Plan community health outreach events and share approved schedules with residents.">
      {canManage.data && <button className="button primary" onClick={() => setShowForm((visible) => !visible)}><CalendarHeart size={16} />Plan outreach</button>}
    </PageHeading>
    <div className="ops-panel referral-privacy-notice"><ShieldAlert size={18} /><p><strong>Scheduling only.</strong> This page does not store patient records, register participants, provide medical advice, or contact emergency services. Do not enter personal health information.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view published outreach schedules." />}
    {Boolean(tenantId) && (canManage.isPending || canReview.isPending) && <LoadingNotice compact />}
    {(canManage.error || canReview.error) && <ErrorNotice message="Outreach management or review access could not be checked. Published schedules remain available; staff controls are hidden until access can be verified." />}
    {message && <div className="ops-success" role="status"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canAccess && !canManage.isPending && !canReview.isPending && !canManage.error && !canReview.error && <div className="ops-panel archive-access"><CalendarHeart size={20} /><div><strong>Outreach schedule access</strong><p>Residents and other active members can view published schedules. BHWs can propose schedules; Captains review them.</p></div></div>}
    {showForm && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void create(event)}><div className="ops-panel-heading"><div><h2>Plan a community outreach event</h2><p>New schedules stay private until reviewed by a Captain.</p></div><CalendarHeart size={19} /></div>
      <div className="ops-form-grid"><label>Event title<input name="title" minLength={3} maxLength={180} required placeholder="Community health outreach" /></label><label>Location<input name="location" minLength={2} maxLength={240} required placeholder="Venue or meeting point" /></label><label>Starts<input name="starts" type="datetime-local" required /></label><label>Ends<input name="ends" type="datetime-local" required /></label><label className="span-two">Public event details<textarea name="description" maxLength={2000} placeholder="Share logistics and general event information. Do not include participant or patient information." /></label></div>
      <div className="ops-form-actions"><button className="button primary" disabled={busy}>Submit for review</button></div>
    </form>}
    {campaigns.isPending && tenantId && <LoadingNotice />}{campaigns.error && <ErrorNotice message="Unable to load outreach schedules." />}
    {campaigns.data?.length === 0 && <div className="ops-empty"><CalendarHeart size={22} /><strong>No outreach schedules yet</strong><p>Published community events will appear here.</p></div>}
    <div className="referral-list">{campaigns.data?.map((campaign) => <article className="ops-panel referral-card" key={campaign.id}>
      <div className="referral-card-head"><div><h2>{campaign.title}</h2><p><MapPin size={14} />{campaign.location}</p></div><StatusPill status={campaign.status} /></div>
      {campaign.description && <p className="referral-summary">{campaign.description}</p>}
      <div className="referral-meta"><span><strong>Starts</strong>{formatDateTime(campaign.starts_at)}</span><span><strong>Ends</strong>{formatDateTime(campaign.ends_at)}</span></div>
      {campaign.review_note && <p className="field-hint">Review note: {campaign.review_note}</p>}
      {canReview.data && campaign.status === 'draft' && <div className="ops-form-actions"><button className="button primary" disabled={busy || campaign.created_by === user?.id} title={campaign.created_by === user?.id ? 'The creator cannot approve their own schedule.' : undefined} onClick={() => void act(campaign, 'approve')}>Publish</button><button className="button outline" disabled={busy} onClick={() => void act(campaign, 'reject')}>Return with reason</button></div>}
      {canManage.data && campaign.status === 'published' && new Date(campaign.ends_at).getTime() <= Date.now() && <div className="ops-form-actions"><button className="button outline" disabled={busy} onClick={() => void act(campaign, 'complete')}>Mark complete</button></div>}
    </article>)}</div>
  </section>
}
