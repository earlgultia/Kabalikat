-- Record high-level platform administration actions without copying private tenant data.
create table public.platform_activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete restrict,
  barangay_id uuid references public.barangays(id) on delete restrict,
  event_type text not null check (event_type in ('barangay_onboarded', 'subscription_created', 'subscription_updated')),
  summary text not null check (length(summary) between 3 and 300),
  created_at timestamptz not null default now()
);

create index platform_activity_events_created_idx
  on public.platform_activity_events(created_at desc, id desc);
create index platform_activity_events_tenant_created_idx
  on public.platform_activity_events(barangay_id, created_at desc, id desc);

alter table public.platform_activity_events enable row level security;
create policy platform_activity_events_admin_read on public.platform_activity_events
  for select to authenticated using (public.is_platform_administrator());
revoke all on public.platform_activity_events from anon, authenticated;
grant select on public.platform_activity_events to authenticated;

create or replace function public.record_platform_barangay_onboarding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.platform_activity_events(actor_id, barangay_id, event_type, summary)
  values (auth.uid(), new.id, 'barangay_onboarded', 'Barangay workspace onboarded');
  return new;
end;
$$;

revoke all on function public.record_platform_barangay_onboarding() from public, anon, authenticated;
drop trigger if exists barangays_record_platform_onboarding on public.barangays;
create trigger barangays_record_platform_onboarding
  after insert on public.barangays
  for each row execute function public.record_platform_barangay_onboarding();

create or replace function public.record_platform_subscription_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  select subscription.barangay_id into v_barangay_id
  from public.subscriptions subscription
  where subscription.id = new.subscription_id;

  insert into public.platform_activity_events(actor_id, barangay_id, event_type, summary)
  values (
    new.actor_id,
    v_barangay_id,
    new.action,
    format('Subscription changed: %s/%s to %s/%s',
      coalesce(new.from_plan, 'none'), coalesce(new.from_status, 'none'), new.to_plan, new.to_status)
  );
  return new;
end;
$$;

revoke all on function public.record_platform_subscription_activity() from public, anon, authenticated;
drop trigger if exists subscription_events_record_platform_activity on public.subscription_events;
create trigger subscription_events_record_platform_activity
  after insert on public.subscription_events
  for each row execute function public.record_platform_subscription_activity();

create or replace function public.list_platform_activity_page(
  p_page integer default 0,
  p_page_size integer default 25,
  p_event_type text default 'all',
  p_search text default null
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
  if v_event_type not in ('all', 'barangay_onboarded', 'subscription_created', 'subscription_updated') then
    raise exception 'invalid platform activity filter';
  end if;

  return query
  with filtered as (
    select event.id, event.barangay_id, barangay.name as barangay_name,
      coalesce(nullif(profile.display_name, ''), 'Platform administrator') as actor_name,
      event.event_type, event.summary, event.created_at
    from public.platform_activity_events event
    left join public.barangays barangay on barangay.id = event.barangay_id
    left join public.profiles profile on profile.id = event.actor_id
    where (v_event_type = 'all' or event.event_type = v_event_type)
      and (v_search is null or position(lower(v_search) in lower(coalesce(barangay.name, '') || ' ' || event.summary)) > 0)
  ), counted as (
    select filtered.*, count(*) over () as total_count from filtered
  )
  select counted.id, counted.barangay_id, counted.barangay_name, counted.actor_name,
    counted.event_type, counted.summary, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_platform_activity_page(integer, integer, text, text) from public, anon;
grant execute on function public.list_platform_activity_page(integer, integer, text, text) to authenticated;
