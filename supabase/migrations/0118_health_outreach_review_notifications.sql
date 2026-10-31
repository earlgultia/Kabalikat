-- Notify the schedule creator when a Captain requests changes.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check
  check (resource_type in (
    'announcement','disaster_advisory','resident_profile_change','document_request',
    'community_feedback','meeting_update','health_outreach_cancellation',
    'health_outreach_completion','health_outreach_review'
  ));

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
    when 'health_outreach_completion' then exists (
      select 1 from public.health_outreach_campaigns campaign
      where campaign.id = p_resource_id and campaign.barangay_id = p_barangay_id
        and campaign.status = 'completed'
    )
    when 'health_outreach_review' then exists (
      select 1 from public.health_outreach_events event
      join public.health_outreach_campaigns campaign
        on campaign.id = event.campaign_id and campaign.barangay_id = event.barangay_id
      where event.id = p_resource_id and event.barangay_id = p_barangay_id
        and event.action = 'campaign_rejected'
        and campaign.created_by = (select auth.uid())
        and public.has_tenant_permission(p_barangay_id, 'health.campaign.manage')
    )
    else false
  end;
$$;
revoke all on function public.can_access_community_notification(text, uuid, uuid) from public, anon;
grant execute on function public.can_access_community_notification(text, uuid, uuid) to authenticated;

create or replace function public.review_health_outreach_campaign(p_campaign_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.health_outreach_campaigns%rowtype;
  v_event_id uuid;
begin
  select * into v_campaign from public.health_outreach_campaigns where id = p_campaign_id for update;
  if not found or not public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.review') then
    raise exception 'not authorized';
  end if;
  if v_campaign.status not in ('draft', 'changes_requested') then
    raise exception 'campaign is no longer awaiting review';
  end if;
  if v_campaign.created_by = auth.uid() then
    raise exception 'campaign creator cannot review their own campaign';
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) not between 3 and 1000 then
    raise exception 'a reason is required to request changes';
  end if;

  update public.health_outreach_campaigns
  set status = case when p_approve then 'published' else 'changes_requested' end,
    reviewed_by = auth.uid(), reviewed_at = now(),
    review_note = case when p_approve then null else trim(p_note) end
  where id = v_campaign.id;

  insert into public.health_outreach_events(barangay_id, campaign_id, actor_id, action, note)
  values (v_campaign.barangay_id, v_campaign.id, auth.uid(),
    case when p_approve then 'campaign_published' else 'campaign_rejected' end,
    case when p_approve then '' else trim(p_note) end)
  returning id into v_event_id;

  if not p_approve then
    insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
    values (v_campaign.barangay_id, v_campaign.created_by, 'health_outreach_review', v_event_id)
    on conflict (recipient_id, resource_type, resource_id) do nothing;
  end if;
end;
$$;
revoke all on function public.review_health_outreach_campaign(uuid, boolean, text) from public, anon;
grant execute on function public.review_health_outreach_campaign(uuid, boolean, text) to authenticated;

create or replace function public.list_my_health_outreach_review_details(p_barangay_id uuid, p_event_ids uuid[])
returns table (
  event_id uuid,
  campaign_id uuid,
  title text,
  review_note text,
  campaign_status text,
  page_number integer
)
language sql stable security invoker set search_path = '' as $$
  with ranked_campaigns as (
    select campaign.id, campaign.barangay_id, campaign.title, campaign.status,
      ((row_number() over (partition by campaign.status order by campaign.starts_at, campaign.id) - 1) / 20)::integer as page_number
    from public.health_outreach_campaigns campaign
    where campaign.barangay_id = p_barangay_id
  )
  select event.id, campaign.id, campaign.title, event.note, campaign.status, campaign.page_number
  from public.health_outreach_events event
  join ranked_campaigns campaign on campaign.id = event.campaign_id and campaign.barangay_id = event.barangay_id
  where public.is_active_member(p_barangay_id)
    and public.has_tenant_permission(p_barangay_id, 'health.campaign.manage')
    and event.barangay_id = p_barangay_id
    and event.id = any(coalesce(p_event_ids, '{}'::uuid[]))
    and event.action = 'campaign_rejected'
    and exists (
      select 1 from public.health_outreach_campaigns owned
      where owned.id = event.campaign_id and owned.barangay_id = event.barangay_id
        and owned.created_by = (select auth.uid())
    );
$$;
revoke all on function public.list_my_health_outreach_review_details(uuid, uuid[]) from public, anon;
grant execute on function public.list_my_health_outreach_review_details(uuid, uuid[]) to authenticated;
