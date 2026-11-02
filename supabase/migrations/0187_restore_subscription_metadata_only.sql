-- Restore subscription entitlements to catalog metadata only. This reverses
-- feature gating from 0186 while keeping manual plan requests and activation.

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
  );
$$;

drop policy if exists barangay_projects_read on public.barangay_projects;
create policy barangay_projects_read on public.barangay_projects for select to authenticated
  using (public.is_active_member(barangay_id));
drop policy if exists barangay_project_updates_read on public.barangay_project_updates;
create policy barangay_project_updates_read on public.barangay_project_updates for select to authenticated
  using (public.is_active_member(barangay_id));

drop policy if exists health_outreach_campaigns_read on public.health_outreach_campaigns;
create policy health_outreach_campaigns_read on public.health_outreach_campaigns for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'health.campaign.manage')
    or public.has_tenant_permission(barangay_id, 'health.campaign.review')
    or (public.is_active_member(barangay_id) and status in ('published', 'completed', 'cancelled')));

drop policy if exists sk_events_read on public.sk_events;
create policy sk_events_read on public.sk_events for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'sk.event.manage')
    or public.has_tenant_permission(barangay_id, 'sk.event.review')
    or (public.is_active_member(barangay_id) and status in ('published', 'completed', 'cancelled')));

drop policy if exists sk_public_accomplishments_read on public.sk_public_accomplishments;
create policy sk_public_accomplishments_read on public.sk_public_accomplishments for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'sk.manage')
    or public.has_tenant_permission(barangay_id, 'sk.review')
    or (status = 'published' and public.is_active_member(barangay_id)));

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'announcement.publish')
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience = 'officials' and public.has_tenant_permission(barangay_id, 'announcement.officials.read'))
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience = 'public' and public.is_active_member(barangay_id))
    or (status = 'published' and (expires_at is null or expires_at > now()) and audience = 'residents'
      and exists (select 1 from public.barangay_memberships m
        join public.role_definitions r on r.id = m.role_id and r.key = 'resident'
        where m.user_id = (select auth.uid()) and m.barangay_id = announcements.barangay_id and m.status = 'active'))
    or (status = 'published' and (expires_at is null or expires_at > now()) and audience = 'role'
      and exists (select 1 from public.barangay_memberships m
        join public.role_definitions r on r.id = m.role_id and r.scope = 'barangay'
        where m.user_id = (select auth.uid()) and m.barangay_id = announcements.barangay_id
          and m.role_id = announcements.audience_role_id and m.status = 'active')));

drop policy if exists document_types_read on public.document_types;
create policy document_types_read on public.document_types for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'document.request.review')
    or public.has_tenant_permission(barangay_id, 'document.type.manage')
    or (public.is_active_member(barangay_id) and public_request_enabled));

drop function if exists public.get_barangay_plan_features(uuid);
drop function if exists public.tenant_plan_feature_enabled(uuid, text);
drop function if exists public.subscription_feature_for_permission(text);

revoke all on function public.has_tenant_permission(uuid, text) from public, anon;
grant execute on function public.has_tenant_permission(uuid, text) to authenticated;
