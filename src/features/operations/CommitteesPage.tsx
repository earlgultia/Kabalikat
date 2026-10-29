import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, UsersRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { assignCommitteeMember, createCommittee, createCommitteeTask, listAssignableCommitteeMembers, listCommitteeMembers, listCommittees, listCommitteeTasks, updateCommitteeTaskStatus, type CommitteeTaskRow } from './committee-data'
import { hasPermission } from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const committeeSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000) })
const taskSchema = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), assignedTo: z.string(), dueDate: z.string() })

export function CommitteesPage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'committee.manage'], queryFn: () => hasPermission(tenantId, 'committee.manage'), enabled: Boolean(tenantId) })
  const committees = useQuery({ queryKey: ['committees', tenantId], queryFn: () => listCommittees(tenantId), enabled: Boolean(tenantId) })
  const tasks = useQuery({ queryKey: ['committee-tasks', tenantId], queryFn: () => listCommitteeTasks(tenantId), enabled: Boolean(tenantId) })
  const members = useQuery({ queryKey: ['committee-members', tenantId], queryFn: () => listCommitteeMembers(tenantId), enabled: Boolean(tenantId) })
  const candidates = useQuery({ queryKey: ['committee-candidates', tenantId], queryFn: () => listAssignableCommitteeMembers(tenantId), enabled: Boolean(tenantId && canManage.data) })
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['committees', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['committee-tasks', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['committee-members', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['committee-candidates', tenantId] }),
    ])
  }

  async function submitCommittee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = committeeSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the committee details.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await createCommittee(tenantId, parsed.data.name, parsed.data.description); await refresh(); form.reset(); setShowCreate(false); setMessage('Committee created.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to create this committee.') }
    finally { setBusy(false) }
  }

  async function assignMember(committeeId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const userId = String(new FormData(form).get('userId') ?? '')
    if (!userId) return
    setBusy(true); setError(''); setMessage('')
    try { await assignCommitteeMember(committeeId, userId); await refresh(); form.reset(); setMessage('Member assigned to the committee.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to assign this member.') }
    finally { setBusy(false) }
  }

  async function addTask(committeeId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget
    const parsed = taskSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the action item.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await createCommitteeTask({ committeeId, title: parsed.data.title, description: parsed.data.description,
        assignedTo: canManage.data ? parsed.data.assignedTo : user?.id ?? '', dueDate: parsed.data.dueDate })
      await refresh(); form.reset(); setMessage('Action item added to the committee workspace.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add this action item.') }
    finally { setBusy(false) }
  }

  async function changeStatus(task: CommitteeTaskRow, status: CommitteeTaskRow['status']) {
    setBusy(true); setError(''); setMessage('')
    try { await updateCommitteeTaskStatus(task.id, status); await refresh(); setMessage('Action item status updated.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the action item.') }
    finally { setBusy(false) }
  }

  const displayName = (memberId: string) => members.data?.find((member) => member.user_id === memberId)?.profile?.display_name || candidates.data?.find((candidate) => candidate.user_id === memberId)?.display_name || 'Assigned member'
  const initials = (memberId: string) => displayName(memberId).split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  return <section className="operation-page">
    <PageHeading title="Committee workspaces" description="Coordinate assigned members and track committee action items.">
      {canManage.data && <button className="button primary" onClick={() => setShowCreate((visible) => !visible)}>New committee</button>}
    </PageHeading>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view assigned committee workspaces." />}
    {Boolean(tenantId) && canManage.isPending && <LoadingNotice compact />}
    {canManage.error && <ErrorNotice message="Committee management access could not be checked. Existing assignments can still be viewed; management controls are unavailable until access can be verified." />}
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {Boolean(tenantId) && !canManage.isPending && !canManage.error && !canManage.data && <div className="ops-panel archive-access"><UsersRound size={20} /><div><strong>Committee access is assignment-based</strong><p>You will see committees after an authorized administrator assigns you to one.</p></div></div>}
    {showCreate && canManage.data && <form className="ops-panel ops-form" onSubmit={(event) => void submitCommittee(event)}><div className="ops-panel-heading"><div><h2>Create a committee</h2><p>Only authorized committee managers can configure workspaces.</p></div><UsersRound size={18} /></div><div className="ops-form-grid"><label>Committee name<input name="name" maxLength={120} required /></label><label className="span-two">Purpose / description<textarea name="description" maxLength={1000} /></label></div><div className="ops-form-actions"><button className="button primary" disabled={busy}>Create committee</button></div></form>}
    {committees.isPending && tenantId && <LoadingNotice />}{committees.error && <ErrorNotice message={committees.error.message} />}
    {committees.data?.length === 0 && <div className="ops-empty"><UsersRound size={22} /><strong>No committee workspaces assigned</strong><p>Ask an authorized Captain or Secretary to create or assign a committee.</p></div>}
    <div className="committee-workspace-list">{committees.data?.map((committee) => {
      const committeeMembers = members.data?.filter((member) => member.committee_id === committee.id) ?? []
      const committeeTasks = tasks.data?.filter((task) => task.committee_id === committee.id) ?? []
      return <article className="ops-panel committee-workspace" key={committee.id}>
        <div className="committee-workspace-heading"><div><span className="status-pill status-active">Active</span><h2>{committee.name}</h2><p>{committee.description || 'No description provided.'}</p></div><UsersRound size={20} /></div>
        <section className="committee-members"><h3>Members <span>{committeeMembers.length}</span></h3>{committeeMembers.length ? <ul>{committeeMembers.map((member) => <li key={member.user_id}><span className="committee-avatar">{initials(member.user_id)}</span><span>{displayName(member.user_id)}</span></li>)}</ul> : <p>No members assigned yet.</p>}
          {canManage.data && <form className="committee-inline-form" onSubmit={(event) => void assignMember(committee.id, event)}><label>Add a member<select name="userId" required defaultValue=""><option value="" disabled>Select active member</option>{candidates.data?.filter((candidate) => !committeeMembers.some((member) => member.user_id === candidate.user_id)).map((candidate) => <option key={candidate.user_id} value={candidate.user_id}>{candidate.display_name} · {candidate.role_label}</option>)}</select></label><button className="button outline" disabled={busy || !candidates.data?.some((candidate) => !committeeMembers.some((member) => member.user_id === candidate.user_id))}>Assign</button></form>}
        </section>
        <section className="committee-tasks"><h3>Action items <span>{committeeTasks.length}</span></h3>{committeeTasks.length ? <ul>{committeeTasks.map((task) => <li key={task.id}><div><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}<small>{task.assigned_to ? `Assigned to ${displayName(task.assigned_to)}` : 'Unassigned'}{task.due_date ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}` : ''}</small></div><div className="committee-task-status"><StatusPill status={task.status} />{(canManage.data || task.assigned_to === user?.id) && <select aria-label={`Update status for ${task.title}`} value={task.status} disabled={busy} onChange={(event) => void changeStatus(task, event.target.value as CommitteeTaskRow['status'])}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select>}</div></li>)}</ul> : <p>No action items yet.</p>}
          <form className="committee-task-form" onSubmit={(event) => void addTask(committee.id, event)}><label>Action item<input name="title" placeholder="Prepare a community proposal" maxLength={180} required /></label><label>Details<textarea name="description" maxLength={2000} /></label><div className="committee-task-form-row">{canManage.data && <label>Assign to<select name="assignedTo" defaultValue=""><option value="">Unassigned</option>{committeeMembers.map((member) => <option key={member.user_id} value={member.user_id}>{displayName(member.user_id)}</option>)}</select></label>}<label>Due date<input type="date" name="dueDate" /></label><button className="button primary" disabled={busy}>Add action item</button></div></form>
        </section>
      </article>
    })}</div>
  </section>
}
