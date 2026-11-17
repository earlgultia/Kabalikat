-- Existing members must lose tenant access when a barangay workspace is
-- suspended or archived. Subscription access remains tenant-specific; only
-- the barangay workspace's own status is checked here.

create or replace function public.is_active_member(p_barangay_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barangay_memberships as membership
    join public.barangays as barangay on barangay.id = membership.barangay_id
    where membership.user_id = (select auth.uid())
      and membership.barangay_id = p_barangay_id
      and membership.status = 'active'
      and barangay.status = 'active'
  );
$$;

revoke all on function public.is_active_member(uuid) from public, anon;
grant execute on function public.is_active_member(uuid) to authenticated;

create or replace function public.has_tenant_permission(p_barangay_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barangay_memberships as membership
    join public.role_permissions as role_permission on role_permission.role_id = membership.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    left join public.membership_permissions as membership_permission
      on membership_permission.membership_id = membership.id
      and membership_permission.permission_id = permission.id
    where membership.user_id = (select auth.uid())
      and membership.barangay_id = p_barangay_id
      and membership.status = 'active'
      and permission.key = p_permission
      and coalesce(membership_permission.effect, 'allow') = 'allow'
      and public.is_active_member(p_barangay_id)
      and (
        public.subscription_feature_for_permission(permission.key) is null
        or public.tenant_plan_feature_enabled(
          p_barangay_id,
          public.subscription_feature_for_permission(permission.key)
        )
      )
  );
$$;

revoke all on function public.has_tenant_permission(uuid, text) from public, anon;
grant execute on function public.has_tenant_permission(uuid, text) to authenticated;
