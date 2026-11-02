-- Keep plan setup simple: four clear feature groups control the barangay
-- modules shown in Captain and staff workspaces, while role permissions still
-- decide what each member may do inside an enabled module.

create or replace function public.subscription_feature_for_permission(p_permission text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_permission like any (array[
      'resident.%', 'household.%', 'document.%', 'meeting.%', 'attendance.%',
      'announcement.%', 'archive.%', 'referral.%', 'referrals.%', 'community.feedback.%'
    ]) then 'core_services'
    when p_permission like 'finance.%' then 'finance'
    when p_permission like any (array[
      'committee.%', 'project.%', 'health.%', 'sk.event.%', 'sk.project.%',
      'sk.accomplishment.%', 'community.calendar.%', 'sk.manage', 'sk.review'
    ]) then 'community_programs'
    when p_permission like any (array['incident.%', 'patrol.%', 'advisory.%', 'disaster.%']) then 'public_safety'
    else null
  end;
$$;

revoke all on function public.subscription_feature_for_permission(text) from public, anon, authenticated;

create or replace function public.tenant_plan_feature_enabled(p_barangay_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      subscription.status in ('free', 'trial', 'active')
      or (subscription.status = 'past_due' and subscription.grace_ends_at > now())
    )
    and (
      -- Older plan rows have no feature configuration. Keep their current
      -- access until an administrator saves the new switches for that plan.
      not (coalesce(plan.entitlements, '{}'::jsonb) ?| array[
        'core_services', 'finance', 'community_programs', 'public_safety'
      ])
      or coalesce((plan.entitlements ->> p_feature)::boolean, false)
    ),
    false
  )
  from public.subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id
  where subscription.barangay_id = p_barangay_id;
$$;

create or replace function public.get_barangay_plan_features(p_barangay_id uuid)
returns table (
  plan_name text,
  subscription_status text,
  core_services boolean,
  finance boolean,
  community_programs boolean,
  public_safety boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(p_barangay_id) then
    raise exception 'not authorized';
  end if;

  return query
  select plan.name, subscription.status,
    public.tenant_plan_feature_enabled(p_barangay_id, 'core_services'),
    public.tenant_plan_feature_enabled(p_barangay_id, 'finance'),
    public.tenant_plan_feature_enabled(p_barangay_id, 'community_programs'),
    public.tenant_plan_feature_enabled(p_barangay_id, 'public_safety')
  from public.subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id
  where subscription.barangay_id = p_barangay_id;
end;
$$;

create or replace function public.has_tenant_permission(p_barangay_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barangay_memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    left join public.membership_permissions mp on mp.membership_id = m.id and mp.permission_id = p.id
    where m.user_id = (select auth.uid())
      and m.barangay_id = p_barangay_id
      and m.status = 'active'
      and p.key = p_permission
      and coalesce(mp.effect, 'allow') = 'allow'
      and (
        public.subscription_feature_for_permission(p.key) is null
        or public.tenant_plan_feature_enabled(
          p_barangay_id,
          public.subscription_feature_for_permission(p.key)
        )
      )
  );
$$;

-- Published/read-only RLS branches that previously allowed every active
-- member must use the same plan switch as the permission-checked staff paths.
drop policy if exists barangay_projects_read on public.barangay_projects;
create policy barangay_projects_read on public.barangay_projects for select to authenticated
  using (public.is_active_member(barangay_id)
    and public.tenant_plan_feature_enabled(barangay_id, 'community_programs'));
drop policy if exists barangay_project_updates_read on public.barangay_project_updates;
create policy barangay_project_updates_read on public.barangay_project_updates for select to authenticated
  using (public.is_active_member(barangay_id)
    and public.tenant_plan_feature_enabled(barangay_id, 'community_programs'));

drop policy if exists health_outreach_campaigns_read on public.health_outreach_campaigns;
create policy health_outreach_campaigns_read on public.health_outreach_campaigns for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'health.campaign.manage')
    or public.has_tenant_permission(barangay_id, 'health.campaign.review')
    or (public.is_active_member(barangay_id)
      and public.tenant_plan_feature_enabled(barangay_id, 'community_programs')
      and status in ('published', 'completed', 'cancelled')));

drop policy if exists sk_events_read on public.sk_events;
create policy sk_events_read on public.sk_events for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'sk.event.manage')
    or public.has_tenant_permission(barangay_id, 'sk.event.review')
    or (public.is_active_member(barangay_id)
      and public.tenant_plan_feature_enabled(barangay_id, 'community_programs')
      and status in ('published', 'completed', 'cancelled')));

drop policy if exists sk_public_accomplishments_read on public.sk_public_accomplishments;
create policy sk_public_accomplishments_read on public.sk_public_accomplishments for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'sk.manage')
    or public.has_tenant_permission(barangay_id, 'sk.review')
    or (status = 'published' and public.is_active_member(barangay_id)
      and public.tenant_plan_feature_enabled(barangay_id, 'community_programs')));

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'announcement.publish')
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience = 'officials' and public.has_tenant_permission(barangay_id, 'announcement.officials.read'))
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience = 'public' and public.is_active_member(barangay_id)
      and public.tenant_plan_feature_enabled(barangay_id, 'core_services'))
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience = 'residents' and public.tenant_plan_feature_enabled(barangay_id, 'core_services')
      and exists (select 1 from public.barangay_memberships m
        join public.role_definitions r on r.id = m.role_id and r.key = 'resident'
        where m.user_id = (select auth.uid()) and m.barangay_id = announcements.barangay_id and m.status = 'active'))
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience = 'role' and public.tenant_plan_feature_enabled(barangay_id, 'core_services')
      and exists (select 1 from public.barangay_memberships m
        join public.role_definitions r on r.id = m.role_id and r.scope = 'barangay'
        where m.user_id = (select auth.uid()) and m.barangay_id = announcements.barangay_id
          and m.role_id = announcements.audience_role_id and m.status = 'active')));

drop policy if exists document_types_read on public.document_types;
create policy document_types_read on public.document_types for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'document.request.review')
    or (public.is_active_member(barangay_id) and public_request_enabled
      and public.tenant_plan_feature_enabled(barangay_id, 'core_services')));

revoke all on function public.tenant_plan_feature_enabled(uuid, text) from public, anon, authenticated;
revoke all on function public.get_barangay_plan_features(uuid) from public, anon;
grant execute on function public.get_barangay_plan_features(uuid) to authenticated;
revoke all on function public.has_tenant_permission(uuid, text) from public, anon;
grant execute on function public.has_tenant_permission(uuid, text) to authenticated;

