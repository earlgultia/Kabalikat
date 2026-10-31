-- Notify active members when staff cancel a published outreach schedule.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement','disaster_advisory','resident_profile_change','document_request',
    'community_feedback','meeting_update','health_outreach_cancellation'
  ));

alter table public.community_notification_preferences
  drop constraint if exists community_notification_preferences_resource_type_check;
alter table public.community_notification_preferences
  add constraint community_notification_preferences_resource_type_check
  check (resource_type in ('announcement','disaster_advisory','meeting_update','health_outreach_update'));

create or replace function public.can_access_community_notification(
  p_resource_type text,
  p_resource_id uuid,
  p_barangay_id uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_member(p_barangay_id) and case p_resource_type
    when 'announcement' then exists (
      select 1 from public.announcements a
      where a.id = p_resource_id and a.barangay_id = p_barangay_id
        and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
        and case a.audience
          when 'public' then true
          when 'officials' then public.has_tenant_permission(p_barangay_id, 'announcement.officials.read')
          when 'residents' then exists (
            select 1 from public.barangay_memberships m
            join public.role_definitions r on r.id = m.role_id and r.key = 'resident'
            where m.user_id = (select auth.uid()) and m.barangay_id = p_barangay_id and m.status = 'active'
          )
          when 'role' then exists (
            select 1 from public.barangay_memberships m
            join public.role_definitions r on r.id = m.role_id and r.scope = 'barangay'
            where m.user_id = (select auth.uid()) and m.barangay_id = p_barangay_id
              and m.status = 'active' and m.role_id = a.audience_role_id
          )
          else false
        end
    )
    when 'disaster_advisory' then exists (
      select 1 from public.disaster_advisories a
      where a.id = p_resource_id and a.barangay_id = p_barangay_id
        and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
        and public.has_tenant_permission(p_barangay_id, 'disaster.read')
    )
    when 'resident_profile_change' then exists (
      select 1 from public.resident_profile_change_requests r
      where r.id = p_resource_id and r.barangay_id = p_barangay_id
        and r.requested_by = (select auth.uid()) and r.status in ('approved','rejected')
    )
    when 'document_request' then exists (
      select 1 from public.document_requests d
      join public.residents r on r.id = d.resident_id and r.barangay_id = d.barangay_id
      where d.id = p_resource_id and d.barangay_id = p_barangay_id and r.user_id = (select auth.uid())
    )
    when 'community_feedback' then exists (
      select 1 from public.community_feedback f
      where f.id = p_resource_id and f.barangay_id = p_barangay_id
        and f.submitted_by = (select auth.uid())
        and (f.status = 'closed' or (f.status = 'responded' and f.staff_response is not null))
    )
    when 'meeting_update' then exists (
      select 1 from public.meeting_update_events e
      join public.meeting_attendees a
        on a.meeting_id = e.meeting_id and a.barangay_id = e.barangay_id
      where e.id = p_resource_id and e.barangay_id = p_barangay_id
        and a.user_id = (select auth.uid())
    )
    when 'health_outreach_cancellation' then exists (
      select 1 from public.health_outreach_campaigns campaign
      where campaign.id = p_resource_id and campaign.barangay_id = p_barangay_id
        and campaign.status = 'cancelled'
    )
    else false
  end;
$$;
revoke all on function public.can_access_community_notification(text, uuid, uuid) from public, anon;
grant execute on function public.can_access_community_notification(text, uuid, uuid) to authenticated;

create or replace function public.cancel_health_outreach_campaign(p_campaign_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.health_outreach_campaigns%rowtype;
begin
  select * into v_campaign
  from public.health_outreach_campaigns
  where id = p_campaign_id
  for update;

  if not found or not (
    public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.manage')
    or public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.review')
  ) then
    raise exception 'not authorized';
  end if;
  if v_campaign.status <> 'published' or v_campaign.ends_at <= now() then
    raise exception 'only upcoming or in-progress published schedules can be cancelled';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'a cancellation reason is required';
  end if;

  update public.health_outreach_campaigns
  set status = 'cancelled', cancellation_reason = trim(p_reason)
  where id = v_campaign.id;

  insert into public.health_outreach_events(barangay_id, campaign_id, actor_id, action, note)
  values (v_campaign.barangay_id, v_campaign.id, auth.uid(), 'campaign_cancelled', trim(p_reason));

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select v_campaign.barangay_id, membership.user_id, 'health_outreach_cancellation', v_campaign.id
  from public.barangay_memberships membership
  where membership.barangay_id = v_campaign.barangay_id
    and membership.status = 'active'
    and membership.user_id is distinct from auth.uid()
    and not exists (
      select 1 from public.community_notification_preferences preference
      where preference.user_id = membership.user_id
        and preference.barangay_id = v_campaign.barangay_id
        and preference.resource_type = 'health_outreach_update'
        and preference.enabled = false
    )
  on conflict (recipient_id, resource_type, resource_id) do nothing;
end;
$$;
revoke all on function public.cancel_health_outreach_campaign(uuid, text) from public, anon;
grant execute on function public.cancel_health_outreach_campaign(uuid, text) to authenticated;

drop function if exists public.list_my_health_outreach_cancellation_details(uuid, uuid[]);
create function public.list_my_health_outreach_cancellation_details(p_barangay_id uuid, p_campaign_ids uuid[])
returns table (
  campaign_id uuid,
  title text,
  cancellation_reason text,
  page_number integer
)
language sql stable security invoker set search_path = '' as $$
  with requested as (
    select campaign.id, campaign.title, campaign.cancellation_reason,
      ((row_number() over (order by campaign.starts_at, campaign.id) - 1) / 20)::integer as page_number
    from public.health_outreach_campaigns campaign
    where public.is_active_member(p_barangay_id)
      and campaign.barangay_id = p_barangay_id
      and campaign.status = 'cancelled'
  )
  select requested.id, requested.title, requested.cancellation_reason, requested.page_number
  from requested
  where requested.id = any(coalesce(p_campaign_ids, '{}'::uuid[]));
$$;
revoke all on function public.list_my_health_outreach_cancellation_details(uuid, uuid[]) from public, anon;
grant execute on function public.list_my_health_outreach_cancellation_details(uuid, uuid[]) to authenticated;
