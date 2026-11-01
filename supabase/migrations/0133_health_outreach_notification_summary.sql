-- Expose aggregate in-app notification reach to authorized outreach managers.
create or replace function public.get_health_outreach_notification_summary(
  p_barangay_id uuid, p_campaign_id uuid
) returns table (
  publication_sent bigint, publication_read bigint,
  schedule_update_sent bigint, schedule_update_read bigint,
  cancellation_sent bigint, cancellation_read bigint,
  completion_sent bigint, completion_read bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_campaign public.health_outreach_campaigns%rowtype;
begin
  if not public.is_active_member(p_barangay_id)
    or not public.has_tenant_permission(p_barangay_id, 'health.campaign.manage') then
    raise exception 'not authorized';
  end if;
  select * into v_campaign from public.health_outreach_campaigns campaign
  where campaign.id = p_campaign_id and campaign.barangay_id = p_barangay_id;
  if not found then raise exception 'campaign not found'; end if;

  return query
  select
    count(*) filter (where notification.resource_type = 'health_outreach_published')::bigint,
    count(*) filter (where notification.resource_type = 'health_outreach_published' and notification.read_at is not null)::bigint,
    count(*) filter (where notification.resource_type = 'health_outreach_rescheduled')::bigint,
    count(*) filter (where notification.resource_type = 'health_outreach_rescheduled' and notification.read_at is not null)::bigint,
    count(*) filter (where notification.resource_type = 'health_outreach_cancellation')::bigint,
    count(*) filter (where notification.resource_type = 'health_outreach_cancellation' and notification.read_at is not null)::bigint,
    count(*) filter (where notification.resource_type = 'health_outreach_completion')::bigint,
    count(*) filter (where notification.resource_type = 'health_outreach_completion' and notification.read_at is not null)::bigint
  from public.community_notifications notification
  where notification.barangay_id = p_barangay_id and notification.resource_id = p_campaign_id
    and (
      (notification.resource_type = 'health_outreach_published' and v_campaign.status in ('published', 'completed', 'cancelled'))
      or (notification.resource_type = 'health_outreach_rescheduled' and v_campaign.status in ('published', 'completed', 'cancelled'))
      or (notification.resource_type = 'health_outreach_cancellation' and v_campaign.status = 'cancelled')
      or (notification.resource_type = 'health_outreach_completion' and v_campaign.status = 'completed')
    );
end;
$$;
revoke all on function public.get_health_outreach_notification_summary(uuid, uuid) from public, anon;
grant execute on function public.get_health_outreach_notification_summary(uuid, uuid) to authenticated;
