-- Preserve the display name as it was when a platform activity event was recorded.
alter table public.platform_activity_events
  add column actor_name text;

update public.platform_activity_events event
set actor_name = coalesce(nullif(profile.display_name, ''), 'Platform administrator')
from public.profiles profile
where profile.id = event.actor_id
  and event.actor_name is null;

update public.platform_activity_events
set actor_name = 'Platform administrator'
where actor_name is null;

alter table public.platform_activity_events
  alter column actor_name set not null;

create or replace function public.snapshot_platform_activity_actor_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select coalesce(nullif(profile.display_name, ''), 'Platform administrator')
    into new.actor_name
  from public.profiles profile
  where profile.id = new.actor_id;

  new.actor_name := coalesce(new.actor_name, 'Platform administrator');
  return new;
end;
$$;

revoke all on function public.snapshot_platform_activity_actor_name() from public, anon, authenticated;
drop trigger if exists platform_activity_actor_name_snapshot on public.platform_activity_events;
create trigger platform_activity_actor_name_snapshot
  before insert on public.platform_activity_events
  for each row execute function public.snapshot_platform_activity_actor_name();

create or replace function public.list_platform_activity_page(
  p_page integer default 0,
  p_page_size integer default 25,
  p_event_type text default 'all',
  p_search text default null,
  p_created_after timestamptz default null,
  p_created_before timestamptz default null
)
returns table (
  id uuid,
  barangay_id uuid,
  barangay_name text,
  actor_name text,
  event_type text,
  summary text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 1000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_event_type text := coalesce(nullif(p_event_type, ''), 'all');
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if v_event_type not in ('all', 'barangay_onboarded', 'subscription_created', 'subscription_updated', 'subscription_plan_updated') then
    raise exception 'invalid platform activity filter';
  end if;
  if p_created_after is not null and p_created_before is not null and p_created_before <= p_created_after then
    raise exception 'activity end date must be after its start date';
  end if;

  return query
  with filtered as (
    select event.id, event.barangay_id, barangay.name as barangay_name,
      event.actor_name, event.event_type, event.summary, event.created_at
    from public.platform_activity_events event
    left join public.barangays barangay on barangay.id = event.barangay_id
    where (v_event_type = 'all' or event.event_type = v_event_type)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ',
        coalesce(barangay.name, ''), event.summary, event.actor_name
      ))) > 0)
      and (p_created_after is null or event.created_at >= p_created_after)
      and (p_created_before is null or event.created_at < p_created_before)
  ), counted as (
    select filtered.*, count(*) over () as total_count from filtered
  )
  select counted.id, counted.barangay_id, counted.barangay_name, counted.actor_name,
    counted.event_type, counted.summary, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_platform_activity_page(integer, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.list_platform_activity_page(integer, integer, text, text, timestamptz, timestamptz) to authenticated;
