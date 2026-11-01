-- Allow staff to close an outreach early with a reason and aggregate attendance only.
alter table public.health_outreach_events drop constraint if exists health_outreach_events_action_check;
alter table public.health_outreach_events add constraint health_outreach_events_action_check
  check (action in (
    'campaign_created', 'campaign_published', 'campaign_rejected', 'campaign_completed',
    'campaign_completed_early', 'campaign_updated', 'campaign_resubmitted',
    'campaign_cancelled', 'campaign_rescheduled'
  ));

drop function if exists public.complete_health_outreach_campaign(uuid, integer);
create function public.complete_health_outreach_campaign(
  p_campaign_id uuid, p_attendance_count integer, p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign public.health_outreach_campaigns%rowtype;
  v_early boolean;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_campaign from public.health_outreach_campaigns where id = p_campaign_id for update;
  if not found or not public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.manage') then
    raise exception 'not authorized';
  end if;
  if v_campaign.status <> 'published' then raise exception 'only a published campaign can be completed'; end if;
  v_early := v_campaign.ends_at > now();
  if v_early and v_campaign.starts_at > now() then
    raise exception 'an outreach cannot be completed before it starts';
  end if;
  if v_early and length(coalesce(v_reason, '')) not between 3 and 1000 then
    raise exception 'an early completion reason is required';
  end if;
  if p_attendance_count is null or p_attendance_count < 0 or p_attendance_count > 1000000 then
    raise exception 'attendance count must be between 0 and 1000000';
  end if;

  update public.health_outreach_campaigns
  set status = 'completed', completed_at = now(), attendance_count = p_attendance_count
  where id = v_campaign.id;
  insert into public.health_outreach_events(barangay_id, campaign_id, actor_id, action, note)
  values (v_campaign.barangay_id, v_campaign.id, (select auth.uid()),
    case when v_early then 'campaign_completed_early' else 'campaign_completed' end,
    concat('Aggregate attendance count recorded: ', p_attendance_count::text,
      case when v_early then '. Early completion reason: ' || v_reason else '' end));

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select v_campaign.barangay_id, membership.user_id, 'health_outreach_completion', v_campaign.id
  from public.barangay_memberships membership
  where membership.barangay_id = v_campaign.barangay_id and membership.status = 'active'
    and membership.user_id is distinct from (select auth.uid())
    and not exists (
      select 1 from public.community_notification_preferences preference
      where preference.user_id = membership.user_id and preference.barangay_id = v_campaign.barangay_id
        and preference.resource_type = 'health_outreach_update' and preference.enabled = false
    )
  on conflict (recipient_id, resource_type, resource_id) do nothing;
end;
$$;
revoke all on function public.complete_health_outreach_campaign(uuid, integer, text) from public, anon;
grant execute on function public.complete_health_outreach_campaign(uuid, integer, text) to authenticated;
