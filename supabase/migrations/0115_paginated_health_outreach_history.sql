-- Page the staff-only outreach audit trail without exposing event notes to members.
create index if not exists health_outreach_events_page_idx
  on public.health_outreach_events(barangay_id, campaign_id, created_at desc, id desc);

create or replace function public.list_health_outreach_event_page(
  p_barangay_id uuid,
  p_campaign_id uuid,
  p_page integer default 0,
  p_page_size integer default 25
)
returns table (
  id uuid,
  action text,
  note text,
  actor_name text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if not public.has_tenant_permission(p_barangay_id, 'health.campaign.manage')
    and not public.has_tenant_permission(p_barangay_id, 'health.campaign.review') then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from public.health_outreach_campaigns campaign
    where campaign.id = p_campaign_id and campaign.barangay_id = p_barangay_id
  ) then
    raise exception 'outreach schedule not found';
  end if;

  return query
  with matching as (
    select event.id, event.action, event.note,
      coalesce(nullif(profile.display_name, ''), 'Staff member')::text as actor_name,
      event.created_at
    from public.health_outreach_events event
    join public.profiles profile on profile.id = event.actor_id
    where event.barangay_id = p_barangay_id and event.campaign_id = p_campaign_id
  ), counted as (
    select matching.*, count(*) over () as total_count from matching
  )
  select counted.id, counted.action, counted.note, counted.actor_name, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_health_outreach_event_page(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.list_health_outreach_event_page(uuid, uuid, integer, integer) to authenticated;
