import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, History, Search, UserPlus, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { ActionConfirmationDialog } from '../../components/ActionConfirmationDialog'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime, formatManilaCalendarDate } from './format'

const allowedRoles = ['secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod', 'resident'] as const
const accessChangeSchema = z.object({ role: z.enum(allowedRoles), status: z.enum(['active', 'suspended']) })
type MemberRow = { id: string; user_id: string; role_id: string; status: string; created_at: string; role: { key: string; label: string } | null; profile: { display_name: string } | null }
type MemberAccessEvent = { id: string; membership_id: string; action: string; from_role: string; to_role: string; from_status: string; to_status: string; reason: string | null; created_at: string }
type RolePermission = { role_id: string; permission_id: string; permission: { id: string; key: string; description: string } | null }
type MemberPermissionOverride = { membership_id: string; permission_id: string; effect: 'allow' | 'deny' }
type MemberPermissionEvent = { id: string; membership_id: string; permission_key: string; previous_effect: string | null; new_effect: string | null; created_at: string }
type MemberPage = { rows: MemberRow[]; total: number; active: number; suspended: number }
const MEMBER_PAGE_SIZE = 25

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function listMembers(tenantId: string, page: number, search: string, status: string): Promise<MemberPage> {
  const { data, error } = await client().rpc('list_barangay_membership_access_page', {
    p_barangay_id: tenantId,
    p_page: page,
    p_page_size: MEMBER_PAGE_SIZE,
    p_search: search || null,
    p_status: status,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<MemberRow & { role_key: string; role_label: string; display_name: string; total_count: number; active_count: number; suspended_count: number }>
  return {
    rows: rows.map(({ role_key, role_label, display_name, ...member }) => ({
      ...member,
      role: { key: role_key, label: role_label },
      profile: { display_name },
    })),
    total: Number(rows[0]?.total_count ?? 0),
    active: Number(rows[0]?.active_count ?? 0),
    suspended: Number(rows[0]?.suspended_count ?? 0),
  }
}

async function listRolePermissionAssignments(members: MemberRow[]): Promise<{ rolePermissions: RolePermission[]; overrides: MemberPermissionOverride[] }> {
  const roleIds = [...new Set(members.map((member) => member.role_id))]
  const memberIds = members.map((member) => member.id)
  if (!roleIds.length || !memberIds.length) return { rolePermissions: [], overrides: [] }
  const [roleResult, overrideResult] = await Promise.all([
    client().from('role_permissions').select('role_id,permission_id,permission:permissions(id,key,description)').in('role_id', roleIds),
    client().from('membership_permissions').select('membership_id,permission_id,effect').in('membership_id', memberIds),
  ])
  if (roleResult.error) throw new Error(roleResult.error.message)
  if (overrideResult.error) throw new Error(overrideResult.error.message)
  return {
    rolePermissions: (roleResult.data ?? []) as unknown as RolePermission[],
    overrides: (overrideResult.data ?? []) as MemberPermissionOverride[],
  }
}

async function listMemberAccessEvents(tenantId: string): Promise<MemberAccessEvent[]> {
  const { data, error } = await client().from('membership_access_events')
    .select('id,membership_id,action,from_role,to_role,from_status,to_status,reason,created_at')
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }).limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as MemberAccessEvent[]
}

async function listMemberPermissionEvents(tenantId: string): Promise<MemberPermissionEvent[]> {
  const { data, error } = await client().from('membership_permission_events')
    .select('id,membership_id,permission_key,previous_effect,new_effect,created_at')
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }).limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as MemberPermissionEvent[]
}

export function MembersPage({ onOpenInvitations }: { onOpenInvitations?: () => void }) {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const members = useQuery({ queryKey: ['barangay-members-access', tenantId, page, search, statusFilter], queryFn: () => listMembers(tenantId, page, search, statusFilter), enabled: Boolean(tenantId) })
  const events = useQuery({ queryKey: ['barangay-membership-access-events', tenantId], queryFn: () => listMemberAccessEvents(tenantId), enabled: Boolean(tenantId) })
  const permissionEvents = useQuery({ queryKey: ['barangay-membership-permission-events', tenantId], queryFn: () => listMemberPermissionEvents(tenantId), enabled: Boolean(tenantId) })
  const accessPermission = useQuery({ queryKey: ['permission', tenantId, 'membership.manage'], queryFn: async () => {
    const { data, error } = await client().rpc('has_tenant_permission', { p_barangay_id: tenantId, p_permission: 'membership.manage' })
    if (error) throw new Error(error.message)
    return data === true
  }, enabled: Boolean(tenantId) })
  const memberPermissionData = useQuery({
    queryKey: ['barangay-member-permission-assignments', tenantId, members.data?.rows.map((item) => item.id) ?? []],
    queryFn: () => listRolePermissionAssignments(members.data?.rows ?? []),
    enabled: Boolean(tenantId && accessPermission.data && members.data?.rows.length),
  })
  const [drafts, setDrafts] = useState<Record<string, { role: string; status: 'active' | 'suspended' }>>({})
  const [busyId, setBusyId] = useState('')
  const [busyPermissionId, setBusyPermissionId] = useState('')
  const [revokeReasons, setRevokeReasons] = useState<Record<string, string>>({})
  const [revokeTarget, setRevokeTarget] = useState<MemberRow | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const rows = members.data?.rows ?? []
  const totalPages = Math.max(1, Math.ceil((members.data?.total ?? 0) / MEMBER_PAGE_SIZE))

  useEffect(() => {
    if (!members.isPending && !members.error && page >= totalPages) setPage(Math.max(0, totalPages - 1))
  }, [members.error, members.isPending, page, totalPages])

  async function save(member: MemberRow) {
    const currentRole = member.role?.key ?? ''
    const draft = drafts[member.id] ?? { role: currentRole, status: member.status as 'active' | 'suspended' }
    const parsed = accessChangeSchema.safeParse(draft)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the access changes.'); return }
    if (parsed.data.role === currentRole && parsed.data.status === member.status) return
    setBusyId(member.id); setError(''); setSuccess('')
    try {
      const { error: rpcError } = await client().rpc('manage_barangay_member_access', {
        p_barangay_id: tenantId, p_membership_id: member.id,
        p_role_key: parsed.data.role === currentRole ? null : parsed.data.role,
        p_status: parsed.data.status === member.status ? null : parsed.data.status,
      })
      if (rpcError) throw new Error(rpcError.message)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['barangay-members-access', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['barangay-membership-access-events', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['barangay-member-permission-assignments', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-dashboard', tenantId] }),
      ])
      setDrafts((current) => { const next = { ...current }; delete next[member.id]; return next })
      setSuccess('Member access updated and recorded in the access history.')
    } catch { setError('Unable to update member access. The member may have changed or your permission may have changed.') }
    finally { setBusyId('') }
  }

  async function savePermission(member: MemberRow, permission: RolePermission, granted: boolean) {
    if (!permission.permission) return
    const busyKey = `${member.id}:${permission.permission_id}`
    setBusyPermissionId(busyKey); setError(''); setSuccess('')
    try {
      const { error: rpcError } = await client().rpc('set_barangay_member_permission', {
        p_barangay_id: tenantId, p_membership_id: member.id,
        p_permission_key: permission.permission.key, p_granted: granted,
      })
      if (rpcError) throw rpcError
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['barangay-member-permission-assignments', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['barangay-membership-permission-events', tenantId] }),
      ])
      setSuccess(`${permission.permission.description} ${granted ? 'restored' : 'removed'} for ${member.profile?.display_name || 'this member'}.`)
    } catch { setError('Unable to update this permission. It may no longer belong to the member’s role, or your Captain access may have changed.') }
    finally { setBusyPermissionId('') }
  }

  async function revokeAccess() {
    if (!revokeTarget) return
    const reason = revokeReasons[revokeTarget.id]?.trim() ?? ''
    if (reason.length < 3 || reason.length > 500) { setError('Enter a reason between 3 and 500 characters.'); return }
    setBusyId(revokeTarget.id); setError(''); setSuccess('')
    try {
      const { error: rpcError } = await client().rpc('revoke_barangay_member_access', {
        p_barangay_id: tenantId, p_membership_id: revokeTarget.id, p_reason: reason,
      })
      if (rpcError) throw rpcError
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['barangay-members-access', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['barangay-membership-access-events', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['barangay-member-permission-assignments', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-dashboard', tenantId] }),
      ])
      setRevokeReasons((current) => ({ ...current, [revokeTarget.id]: '' }))
      setSuccess(`Access for ${revokeTarget.profile?.display_name || 'this member'} was revoked and recorded in the access history.`)
      setRevokeTarget(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to revoke this member access. Refresh and try again.')
    } finally { setBusyId('') }
  }

  function draftFor(member: MemberRow) {
    return drafts[member.id] ?? { role: member.role?.key ?? 'resident', status: member.status as 'active' | 'suspended' }
  }

  return <section className="operation-page">
    <PageHeading title="Staff & access" description="Review memberships, adjust non-Captain roles, and tailor permissions within each role.">
      {onOpenInvitations && <button type="button" className="button primary" onClick={onOpenInvitations}><UserPlus size={16} />Invite an official</button>}
    </PageHeading>
    <div className="ops-panel member-access-guidance"><ShieldCheck size={18} /><p>Captain access cannot be changed here. Changes apply only to this barangay and are recorded in history. Fine-grained controls can remove permissions included in a role, but cannot add access beyond that role.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active Captain membership to manage staff access." />}
    {accessPermission.isPending && tenantId && <LoadingNotice compact />}
    {accessPermission.error && <ErrorNotice message="Staff access could not be checked. Refresh the page and try again." onRetry={() => void accessPermission.refetch()} retrying={accessPermission.isFetching} />}
    {accessPermission.data === false && <div className="ops-panel"><strong>Staff management is restricted</strong><p>Your current role cannot manage barangay membership access.</p></div>}
    {success && <div className="ops-success" role="status"><CheckCircle2 size={16} />{success}</div>}{error && <ErrorNotice message={error} />}
    {accessPermission.data && <>
      <div className="member-access-summary"><div><strong>{(members.data?.total ?? 0).toLocaleString()}</strong><span>Matching memberships</span></div><div><strong>{(members.data?.active ?? 0).toLocaleString()}</strong><span>Active matches</span></div><div><strong>{(members.data?.suspended ?? 0).toLocaleString()}</strong><span>Suspended matches</span></div><div><strong>{Math.max(0, (members.data?.total ?? 0) - (members.data?.active ?? 0) - (members.data?.suspended ?? 0)).toLocaleString()}</strong><span>Revoked matches</span></div></div>
      <div className="member-access-filters"><label className="archive-search"><Search size={16} /><input type="search" maxLength={100} placeholder="Search member or role" aria-label="Search members by name or role" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} /></label><label>Access status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0) }}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option></select></label></div>
      {members.isPending ? <LoadingNotice /> : members.error ? <ErrorNotice message="Barangay memberships could not be loaded." onRetry={() => void members.refetch()} retrying={members.isFetching} /> : rows.length === 0 ? <EmptyNotice title="No memberships found" detail="Try a different name or status. Accepted staff invitations will appear here." /> : <div className="member-access-list">{rows.map((member) => {
        const draft = draftFor(member)
        const changed = draft.role !== member.role?.key || draft.status !== member.status
        const captainRecord = member.role?.key === 'captain'
        const ownRecord = member.user_id === user?.id
        const revokedRecord = member.status === 'revoked'
        const name = member.profile?.display_name.trim() || `Member ${member.user_id.slice(0, 8)}`
        const rolePermissions = memberPermissionData.data?.rolePermissions.filter((assignment) => assignment.role_id === member.role_id && assignment.permission) ?? []
        const overrides = memberPermissionData.data?.overrides.filter((override) => override.membership_id === member.id) ?? []
        return <article className="ops-panel member-access-card" key={member.id}>
          <header><div><h2>{name}</h2><p>{member.role?.label ?? 'Unknown role'} · Joined {formatManilaCalendarDate(member.created_at)}</p></div><StatusPill status={member.status} /></header>
          {revokedRecord ? <div className="member-access-revoked"><p>Access to this barangay was revoked. To restore access, create and send this person a new invitation.</p>{onOpenInvitations && <button type="button" className="button outline" onClick={onOpenInvitations}><UserPlus size={15} />Open invitations</button>}</div> : captainRecord || ownRecord ? <p className="member-access-protected">{captainRecord ? 'Captain role is protected from changes in this workspace.' : 'You cannot change your own access from this page.'}</p> : <>
            <div className="member-access-controls">
              <label>Workspace role<select value={draft.role} disabled={busyId === member.id} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, role: event.target.value } }))}>{allowedRoles.map((role) => <option key={role} value={role}>{role === 'sk_chairperson' ? 'SK Chairperson' : role === 'bhw' ? 'Barangay Health Worker' : role === 'tanod' ? 'Barangay Tanod' : role === 'kagawad' ? 'Barangay Kagawad' : role === 'secretary' ? 'Barangay Secretary' : role === 'treasurer' ? 'Barangay Treasurer' : 'Resident'}</option>)}</select></label>
              <label>Access status<select value={draft.status} disabled={busyId === member.id} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, status: event.target.value as 'active' | 'suspended' } }))}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
              <button type="button" className="button primary" disabled={!changed || busyId === member.id} onClick={() => void save(member)}>{busyId === member.id ? 'Saving…' : 'Save access'}</button>
            </div>
            <p className="field-hint">Suspending removes access to this barangay but keeps the membership and history.</p>
            <details className="member-revoke-details"><summary>End this membership</summary><p className="field-hint">Revoking permanently disables this membership and cancels pending invitations for this person in this barangay. Existing records and audit history remain. A new invitation is required to restore access.</p><label>Reason for revocation<textarea rows={2} maxLength={500} value={revokeReasons[member.id] ?? ''} onChange={(event) => setRevokeReasons((current) => ({ ...current, [member.id]: event.target.value }))} placeholder="Explain why access is being revoked" /></label><button type="button" className="button outline danger-action" disabled={busyId === member.id || (revokeReasons[member.id]?.trim().length ?? 0) < 3} onClick={() => { setError(''); setRevokeTarget(member) }}>Revoke member access</button></details>
            <details className="member-permission-details">
              <summary>Fine-grained permissions{rolePermissions.length ? ` (${rolePermissions.length})` : ''}</summary>
              {memberPermissionData.isPending ? <LoadingNotice compact /> : memberPermissionData.error ? <ErrorNotice message="Role permissions could not be loaded." onRetry={() => void memberPermissionData.refetch()} retrying={memberPermissionData.isFetching} /> : rolePermissions.length ? <>
                <p className="field-hint">Only permissions already included in this role are listed. Turn one off to remove access; turn it on to restore the role’s default. This cannot add privileges beyond the role.</p>
                <div className="member-permission-list">{rolePermissions.map((assignment) => {
                  const definition = assignment.permission!
                  const denied = overrides.some((override) => override.permission_id === assignment.permission_id && override.effect === 'deny')
                  const busyKey = `${member.id}:${assignment.permission_id}`
                  return <label key={assignment.permission_id}><input type="checkbox" checked={!denied} disabled={busyPermissionId === busyKey} onChange={(event) => void savePermission(member, assignment, event.target.checked)} /><span><strong>{definition.key.replaceAll('.', ' · ')}</strong><small>{definition.description}</small></span></label>
                })}</div>
              </> : <p className="field-hint">No role permissions are available to customize.</p>}
            </details>
          </>}
        </article>
      })}</div>}
      {members.data && members.data.total > MEMBER_PAGE_SIZE && <nav className="ops-form-actions member-access-pagination" aria-label="Member access pages"><button type="button" className="button outline" disabled={page === 0 || members.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} />Previous</button><span className="field-hint">Page {page + 1} of {totalPages}</span><button type="button" className="button outline" disabled={page + 1 >= totalPages || members.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={15} /></button></nav>}
      <section className="ops-panel member-access-history"><div className="ops-panel-heading"><div><h2>Recent access history</h2><p>Role and status changes recorded in this barangay.</p></div><History size={18} /></div>
        {events.isPending ? <LoadingNotice compact /> : events.error ? <ErrorNotice message="Access history could not be loaded." onRetry={() => void events.refetch()} retrying={events.isFetching} /> : events.data?.length ? <ol>{events.data.map((entry) => {
          const target = rows.find((member) => member.id === entry.membership_id)
          const summary = entry.action === 'access_changed'
            ? `Role ${entry.from_role} → ${entry.to_role}; status ${entry.from_status} → ${entry.to_status}`
            : entry.action === 'role_changed' ? `Role: ${entry.from_role} → ${entry.to_role}` : `Status: ${entry.from_status} → ${entry.to_status}`
          return <li key={entry.id}><div><strong>{summary}</strong><span>{target?.profile?.display_name || 'Barangay member'}</span>{entry.reason && <small className="member-access-event-reason">Reason: {entry.reason}</small>}</div><time dateTime={entry.created_at}>{formatEventDate(entry.created_at)}</time></li>
        })}</ol> : <p className="field-hint">No access changes have been recorded.</p>}
      </section>
      <section className="ops-panel member-access-history"><div className="ops-panel-heading"><div><h2>Recent permission changes</h2><p>Overrides narrow or restore the permissions included in each role.</p></div><ShieldCheck size={18} /></div>
        {permissionEvents.isPending ? <LoadingNotice compact /> : permissionEvents.error ? <ErrorNotice message="Permission history could not be loaded." onRetry={() => void permissionEvents.refetch()} retrying={permissionEvents.isFetching} /> : permissionEvents.data?.length ? <ol>{permissionEvents.data.map((entry) => {
          const target = rows.find((member) => member.id === entry.membership_id)
          return <li key={entry.id}><div><strong>{entry.new_effect === 'deny' ? 'Removed' : 'Restored'} · {entry.permission_key.replaceAll('.', ' · ')}</strong><span>{target?.profile?.display_name || 'Barangay member'}</span></div><time dateTime={entry.created_at}>{formatEventDate(entry.created_at)}</time></li>
        })}</ol> : <p className="field-hint">No permission overrides have been recorded.</p>}
      </section>
    </>}
    {revokeTarget && <ActionConfirmationDialog title={`Revoke access for ${revokeTarget.profile?.display_name || 'this member'}?`} description={`This permanently revokes this membership in ${membership?.barangay?.name ?? 'this barangay'}, cancels pending invitations for the same email in this workspace, and removes custom permission overrides. Existing profile and operational records remain. Reason: ${revokeReasons[revokeTarget.id]?.trim()}`} confirmLabel="Revoke access" busy={busyId === revokeTarget.id} onCancel={() => setRevokeTarget(null)} onConfirm={() => void revokeAccess()} />}
  </section>
}

function formatEventDate(value: string) {
  return formatDateTime(value)
}
