-- Preserve a staff audit entry when a completed outreach's aggregate count is corrected.
alter table public.health_outreach_events drop constraint if exists health_outreach_events_action_check;
alter table public.health_outreach_events add constraint health_outreach_events_action_check
  check (action in (
    'campaign_created', 'campaign_published', 'campaign_rejected', 'campaign_completed',
    'campaign_completed_early', 'campaign_attendance_corrected', 'campaign_updated',
    'campaign_resubmitted', 'campaign_cancelled', 'campaign_rescheduled'
  ));

create or replace function public.correct_health_outreach_attendance(
  p_campaign_id uuid, p_attendance_count integer, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign public.health_outreach_campaigns%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select * into v_campaign from public.health_outreach_campaigns where id = p_campaign_id for update;
  if not found or not public.has_tenant_permission(v_campaign.barangay_id, 'health.campaign.manage') then
    raise exception 'not authorized';
  end if;
  if v_campaign.status <> 'completed' then
    raise exception 'attendance can only be corrected after the campaign is completed';
  end if;
  if p_attendance_count is null or p_attendance_count < 0 or p_attendance_count > 1000000 then
    raise exception 'attendance count must be between 0 and 1000000';
  end if;
  if length(v_reason) not between 3 and 1000 then
    raise exception 'a correction reason between 3 and 1000 characters is required';
  end if;
  if v_campaign.attendance_count = p_attendance_count then
    raise exception 'the corrected count must differ from the current count';
  end if;

  update public.health_outreach_campaigns
    set attendance_count = p_attendance_count where id = v_campaign.id;
  insert into public.health_outreach_events(barangay_id, campaign_id, actor_id, action, note)
    values (v_campaign.barangay_id, v_campaign.id, (select auth.uid()), 'campaign_attendance_corrected',
      concat('Aggregate attendance corrected from ', coalesce(v_campaign.attendance_count::text, 'not previously recorded'), ' to ', p_attendance_count::text,
        '. Reason: ', v_reason));
end;
$$;
revoke all on function public.correct_health_outreach_attendance(uuid, integer, text) from public, anon;
grant execute on function public.correct_health_outreach_attendance(uuid, integer, text) to authenticated;
