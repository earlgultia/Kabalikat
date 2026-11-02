import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, History, UserPlus, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const allowedRoles = ['secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod', 'resident'] as const
const accessChangeSchema = z.object({ role: z.enum(allowedRoles), status: z.enum(['active', 'suspended']) })
type MemberRow = { id: string; user_id: string; role_id: string; status: string; created_at: string; role: { key: string; label: string } | null; profile: { display_name: string } | null }
type MemberAccessEvent = { id: string; membership_id: string; action: string; from_role: string; to_role: string; from_status: string; to_status: string; created_at: string }
type RolePermission = { role_id: string; permission_id: string; permission: { id: string; key: string; description: string } | null }
type MemberPermissionOverride = { membership_id: string; permission_id: string; effect: 'allow' | 'deny' }
type MemberPermissionEvent = { id: string; membership_id: string; permission_key: string; previous_effect: string | null; new_effect: string | null; created_at: string }

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function listMembers(tenantId: string): Promise<MemberRow[]> {
  const { data, error } = await client().from('barangay_memberships')
    .select('id,user_id,role_id,status,created_at,role:role_definitions(key,label),profile:profiles(display_name)')
    .eq('barangay_id', tenantId).in('status', ['active', 'suspended']).order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MemberRow[]
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
    .select('id,membership_id,action,from_role,to_role,from_status,to_status,created_at')
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
  const members = useQuery({ queryKey: ['barangay-members-access', tenantId], queryFn: () => listMembers(tenantId), enabled: Boolean(tenantId) })
  const events = useQuery({ queryKey: ['barangay-membership-access-events', tenantId], queryFn: () => listMemberAccessEvents(tenantId), enabled: Boolean(tenantId) })
  const permissionEvents = useQuery({ queryKey: ['barangay-membership-permission-events', tenantId], queryFn: () => listMemberPermissionEvents(tenantId), enabled: Boolean(tenantId) })
  const accessPermission = useQuery({ queryKey: ['permission', tenantId, 'membership.manage'], queryFn: async () => {
    const { data, error } = await client().rpc('has_tenant_permission', { p_barangay_id: tenantId, p_permission: 'membership.manage' })
    if (error) throw new Error(error.message)
    return data === true
  }, enabled: Boolean(tenantId) })
  const memberPermissionData = useQuery({
    queryKey: ['barangay-member-permission-assignments', tenantId, members.data?.map((item) => item.id) ?? []],
    queryFn: () => listRolePermissionAssignments(members.data ?? []),
    enabled: Boolean(tenantId && accessPermission.data && members.data?.length),
  })
  const [drafts, setDrafts] = useState<Record<string, { role: string; status: 'active' | 'suspended' }>>({})
  const [busyId, setBusyId] = useState('')
  const [busyPermissionId, setBusyPermissionId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const rows = members.data ?? []

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
    {accessPermission.error && <ErrorNotice message="Staff access could not be checked. Refresh the page and try again." />}
    {accessPermission.data === false && <div className="ops-panel"><strong>Staff management is restricted</strong><p>Your current role cannot manage barangay membership access.</p></div>}
    {success && <div className="ops-success" role="status"><CheckCircle2 size={16} />{success}</div>}{error && <ErrorNotice message={error} />}
    {accessPermission.data && <>
      <div className="member-access-summary"><div><strong>{rows.length.toLocaleString()}</strong><span>Staff and member accounts</span></div><div><strong>{rows.filter((item) => item.status === 'active').length.toLocaleString()}</strong><span>Active</span></div><div><strong>{rows.filter((item) => item.status === 'suspended').length.toLocaleString()}</strong><span>Suspended</span></div></div>
      {members.isPending ? <LoadingNotice /> : members.error ? <ErrorNotice message="Barangay memberships could not be loaded." /> : rows.length === 0 ? <EmptyNotice title="No memberships found" detail="Accepted staff invitations will appear here." /> : <div className="member-access-list">{rows.map((member) => {
        const draft = draftFor(member)
        const changed = draft.role !== member.role?.key || draft.status !== member.status
        const captainRecord = member.role?.key === 'captain'
        const ownRecord = member.user_id === user?.id
        const name = member.profile?.display_name.trim() || `Member ${member.user_id.slice(0, 8)}`
        const rolePermissions = memberPermissionData.data?.rolePermissions.filter((assignment) => assignment.role_id === member.role_id && assignment.permission) ?? []
        const overrides = memberPermissionData.data?.overrides.filter((override) => override.membership_id === member.id) ?? []
        return <article className="ops-panel member-access-card" key={member.id}>
          <header><div><h2>{name}</h2><p>{member.role?.label ?? 'Unknown role'} · Joined {new Date(member.created_at).toLocaleDateString()}</p></div><StatusPill status={member.status} /></header>
          {captainRecord || ownRecord ? <p className="member-access-protected">{captainRecord ? 'Captain role is protected from changes in this workspace.' : 'You cannot change your own access from this page.'}</p> : <>
            <div className="member-access-controls">
              <label>Workspace role<select value={draft.role} disabled={busyId === member.id} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, role: event.target.value } }))}>{allowedRoles.map((role) => <option key={role} value={role}>{role === 'sk_chairperson' ? 'SK Chairperson' : role === 'bhw' ? 'Barangay Health Worker' : role === 'tanod' ? 'Barangay Tanod' : role === 'kagawad' ? 'Barangay Kagawad' : role === 'secretary' ? 'Barangay Secretary' : role === 'treasurer' ? 'Barangay Treasurer' : 'Resident'}</option>)}</select></label>
              <label>Access status<select value={draft.status} disabled={busyId === member.id} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, status: event.target.value as 'active' | 'suspended' } }))}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
              <button type="button" className="button primary" disabled={!changed || busyId === member.id} onClick={() => void save(member)}>{busyId === member.id ? 'Saving…' : 'Save access'}</button>
            </div>
            <p className="field-hint">Suspending removes access to this barangay but keeps the membership and history.</p>
            <details className="member-permission-details">
              <summary>Fine-grained permissions{rolePermissions.length ? ` (${rolePermissions.length})` : ''}</summary>
              {memberPermissionData.isPending ? <LoadingNotice compact /> : memberPermissionData.error ? <ErrorNotice message="Role permissions could not be loaded." /> : rolePermissions.length ? <>
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
      <section className="ops-panel member-access-history"><div className="ops-panel-heading"><div><h2>Recent access history</h2><p>Role and status changes recorded in this barangay.</p></div><History size={18} /></div>
        {events.isPending ? <LoadingNotice compact /> : events.error ? <ErrorNotice message="Access history could not be loaded." /> : events.data?.length ? <ol>{events.data.map((entry) => {
          const target = rows.find((member) => member.id === entry.membership_id)
          const summary = entry.action === 'access_changed'
            ? `Role ${entry.from_role} → ${entry.to_role}; status ${entry.from_status} → ${entry.to_status}`
            : entry.action === 'role_changed' ? `Role: ${entry.from_role} → ${entry.to_role}` : `Status: ${entry.from_status} → ${entry.to_status}`
          return <li key={entry.id}><div><strong>{summary}</strong><span>{target?.profile?.display_name || 'Barangay member'}</span></div><time dateTime={entry.created_at}>{formatEventDate(entry.created_at)}</time></li>
        })}</ol> : <p className="field-hint">No access changes have been recorded.</p>}
      </section>
      <section className="ops-panel member-access-history"><div className="ops-panel-heading"><div><h2>Recent permission changes</h2><p>Overrides narrow or restore the permissions included in each role.</p></div><ShieldCheck size={18} /></div>
        {permissionEvents.isPending ? <LoadingNotice compact /> : permissionEvents.error ? <ErrorNotice message="Permission history could not be loaded." /> : permissionEvents.data?.length ? <ol>{permissionEvents.data.map((entry) => {
          const target = rows.find((member) => member.id === entry.membership_id)
          return <li key={entry.id}><div><strong>{entry.new_effect === 'deny' ? 'Removed' : 'Restored'} · {entry.permission_key.replaceAll('.', ' · ')}</strong><span>{target?.profile?.display_name || 'Barangay member'}</span></div><time dateTime={entry.created_at}>{formatEventDate(entry.created_at)}</time></li>
        })}</ol> : <p className="field-hint">No permission overrides have been recorded.</p>}
      </section>
    </>}
  </section>
}

function formatEventDate(value: string) {
  return new Date(value).toLocaleString()
}
