-- Let platform administrators edit plan catalog metadata without exposing table writes.
alter table public.platform_activity_events
  drop constraint if exists platform_activity_events_event_type_check;
alter table public.platform_activity_events
  add constraint platform_activity_events_event_type_check
  check (event_type in ('barangay_onboarded', 'subscription_created', 'subscription_updated', 'subscription_plan_updated'));

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
  if v_event_type not in ('all', 'barangay_onboarded', 'subscription_created', 'subscription_updated', 'subscription_plan_updated') then
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

create or replace function public.update_platform_subscription_plan(
  p_plan_id uuid,
  p_name text,
  p_description text,
  p_entitlements jsonb,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_entitlement record;
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if p_plan_id is null
    or length(trim(coalesce(p_name, ''))) not between 2 and 100
    or p_description is null
    or length(p_description) > 1000
    or p_active is null
    or p_entitlements is null
    or jsonb_typeof(p_entitlements) <> 'object'
    or (select count(*) from jsonb_object_keys(p_entitlements)) > 30 then
    raise exception 'invalid subscription plan details';
  end if;

  for v_entitlement in select key, value from jsonb_each(p_entitlements)
  loop
    if v_entitlement.key !~ '^[a-z][a-z0-9_]{1,59}$'
      or jsonb_typeof(v_entitlement.value) <> 'boolean' then
      raise exception 'entitlement keys must be valid and values must be boolean';
    end if;
  end loop;

  select * into v_plan
  from public.subscription_plans
  where id = p_plan_id
  for update;
  if not found then
    raise exception 'subscription plan not found';
  end if;
  if v_plan.key = 'free' and not p_active then
    raise exception 'the Free plan must remain available';
  end if;

  update public.subscription_plans
  set name = trim(p_name), description = trim(p_description),
      entitlements = p_entitlements, active = p_active, updated_at = now()
  where id = v_plan.id;

  insert into public.platform_activity_events(actor_id, barangay_id, event_type, summary)
  values (auth.uid(), null, 'subscription_plan_updated', format('Subscription plan catalog updated: %s', v_plan.key));
end;
$$;

revoke all on function public.update_platform_subscription_plan(uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.update_platform_subscription_plan(uuid, text, text, jsonb, boolean) to authenticated;
revoke all on function public.list_platform_activity_page(integer, integer, text, text) from public, anon;
grant execute on function public.list_platform_activity_page(integer, integer, text, text) to authenticated;
