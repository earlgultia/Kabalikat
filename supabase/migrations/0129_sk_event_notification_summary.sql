-- Expose notification reach as aggregate counts to authorized SK managers only.
create or replace function public.get_sk_event_notification_summary(
  p_barangay_id uuid,p_event_id uuid
)
returns table (
  publication_sent bigint,publication_read bigint,
  schedule_update_sent bigint,schedule_update_read bigint,
  cancellation_sent bigint,cancellation_read bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_event public.sk_events%rowtype;
begin
  if not public.is_active_member(p_barangay_id)
    or not public.has_tenant_permission(p_barangay_id,'sk.event.manage') then
    raise exception 'not authorized';
  end if;
  select * into v_event from public.sk_events event
  where event.id = p_event_id and event.barangay_id = p_barangay_id;
  if not found then raise exception 'event not found'; end if;

  return query
  select
    count(*) filter (where notification.resource_type = 'sk_event_published')::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_published' and notification.read_at is not null)::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_rescheduled')::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_rescheduled' and notification.read_at is not null)::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_cancelled')::bigint,
    count(*) filter (where notification.resource_type = 'sk_event_cancelled' and notification.read_at is not null)::bigint
  from public.community_notifications notification
  where notification.barangay_id = p_barangay_id and notification.resource_id = p_event_id
    and ((notification.resource_type = 'sk_event_published' and v_event.status in ('published','completed','cancelled'))
      or (notification.resource_type = 'sk_event_rescheduled' and v_event.status in ('published','completed','cancelled'))
      or (notification.resource_type = 'sk_event_cancelled' and v_event.status = 'cancelled'));
end;
$$;
revoke all on function public.get_sk_event_notification_summary(uuid,uuid) from public,anon;
grant execute on function public.get_sk_event_notification_summary(uuid,uuid) to authenticated;
