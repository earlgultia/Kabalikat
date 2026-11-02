-- Let a Captain request a paid plan while keeping payment confirmation and
-- activation under platform-administrator control.
create table public.subscription_plan_requests (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  requested_plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'activated', 'declined')),
  request_note text not null default '' check (char_length(request_note) <= 500),
  admin_note text not null default '' check (char_length(admin_note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (reviewed_at is null)),
  check ((status = 'pending') = (reviewed_by is null))
);

create unique index subscription_plan_requests_one_pending_per_tenant_idx
  on public.subscription_plan_requests(barangay_id) where status = 'pending';
create index subscription_plan_requests_queue_idx
  on public.subscription_plan_requests(status, created_at desc, id desc);

alter table public.subscription_plan_requests enable row level security;
create policy subscription_plan_requests_read on public.subscription_plan_requests
  for select to authenticated
  using (public.is_platform_administrator()
    or public.has_tenant_permission(barangay_id, 'membership.manage'));
revoke all on public.subscription_plan_requests from anon, authenticated;
grant select on public.subscription_plan_requests to authenticated;

create or replace function public.list_available_subscription_plans()
returns table (plan_key text, plan_name text, plan_description text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not authorized'; end if;
  return query
    select plan.key, plan.name, plan.description
    from public.subscription_plans plan
    where plan.active and plan.key <> 'free'
    order by plan.name;
end;
$$;

create or replace function public.get_barangay_subscription_plan_status(p_barangay_id uuid)
returns table (plan_key text, plan_name text, subscription_status text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;
  return query
    select plan.key, plan.name, subscription.status, subscription.updated_at
    from public.subscriptions subscription
    join public.subscription_plans plan on plan.id = subscription.plan_id
    where subscription.barangay_id = p_barangay_id;
end;
$$;

create or replace function public.list_barangay_subscription_plan_requests(p_barangay_id uuid)
returns table (
  request_id uuid, plan_key text, plan_name text, plan_description text,
  status text, request_note text, admin_note text, created_at timestamptz, reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;
  return query
    select request.id, plan.key, plan.name, plan.description, request.status,
      request.request_note, request.admin_note, request.created_at, request.reviewed_at
    from public.subscription_plan_requests request
    join public.subscription_plans plan on plan.id = request.requested_plan_id
    where request.barangay_id = p_barangay_id
    order by request.created_at desc, request.id desc
    limit 50;
end;
$$;

create or replace function public.request_barangay_subscription_plan(
  p_barangay_id uuid, p_plan_key text, p_request_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_current_plan_key text;
  v_current_status text;
  v_request_id uuid;
  v_note text := trim(coalesce(p_request_note, ''));
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;
  if length(v_note) > 500 then raise exception 'request note is too long'; end if;

  perform 1 from public.barangays where id = p_barangay_id for update;
  if not found then raise exception 'barangay not found'; end if;

  select plan.* into v_plan from public.subscription_plans plan
  where plan.key = p_plan_key and plan.active and plan.key <> 'free';
  if not found then raise exception 'selected subscription plan is unavailable'; end if;

  select plan.key, subscription.status into v_current_plan_key, v_current_status
  from public.subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id
  where subscription.barangay_id = p_barangay_id;
  if not found then raise exception 'barangay subscription record not found'; end if;
  if v_current_status = 'active' and v_current_plan_key = v_plan.key then
    raise exception 'this plan is already active';
  end if;
  if exists (select 1 from public.subscription_plan_requests request
    where request.barangay_id = p_barangay_id and request.status = 'pending') then
    raise exception 'a plan request is already awaiting review';
  end if;

  insert into public.subscription_plan_requests(barangay_id, requested_plan_id, requested_by, request_note)
  values (p_barangay_id, v_plan.id, (select auth.uid()), v_note)
  returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.list_platform_subscription_plan_requests(
  p_page integer default 0,
  p_page_size integer default 20,
  p_status text default 'pending'
)
returns table (
  request_id uuid, barangay_id uuid, barangay_name text, barangay_code text,
  plan_key text, plan_name text, requester_name text, request_note text,
  status text, admin_note text, created_at timestamptz, reviewed_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 1000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_status text := coalesce(nullif(p_status, ''), 'pending');
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if v_status not in ('all', 'pending', 'activated', 'declined') then
    raise exception 'invalid subscription request filter';
  end if;
  return query
    with filtered as (
      select request.id, request.barangay_id, barangay.name as barangay_name,
        barangay.code as barangay_code, plan.key as plan_key, plan.name as plan_name,
        coalesce(nullif(profile.display_name, ''), 'Barangay Captain') as requester_name,
        request.request_note, request.status, request.admin_note, request.created_at, request.reviewed_at
      from public.subscription_plan_requests request
      join public.barangays barangay on barangay.id = request.barangay_id
      join public.subscription_plans plan on plan.id = request.requested_plan_id
      left join public.profiles profile on profile.id = request.requested_by
      where v_status = 'all' or request.status = v_status
    ), counted as (select filtered.*, count(*) over () as total_count from filtered)
    select counted.id, counted.barangay_id, counted.barangay_name, counted.barangay_code,
      counted.plan_key, counted.plan_name, counted.requester_name, counted.request_note,
      counted.status, counted.admin_note, counted.created_at, counted.reviewed_at,
      counted.total_count
    from counted
    order by case when v_status = 'pending' then counted.created_at end asc,
      case when v_status <> 'pending' then counted.created_at end desc, counted.id desc
    offset v_page::bigint * v_page_size
    limit v_page_size;
end;
$$;

create or replace function public.activate_subscription_plan_request(
  p_request_id uuid, p_payment_confirmation_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.subscription_plan_requests%rowtype;
  v_plan_key text;
  v_note text := trim(coalesce(p_payment_confirmation_note, ''));
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if length(v_note) not between 3 and 950 then raise exception 'record how payment was confirmed'; end if;
  select request.* into v_request from public.subscription_plan_requests request
  where request.id = p_request_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'request is no longer pending'; end if;
  select plan.key into v_plan_key from public.subscription_plans plan
  where plan.id = v_request.requested_plan_id and plan.active and plan.key <> 'free';
  if not found then raise exception 'requested plan is no longer available'; end if;

  perform public.set_platform_subscription(
    v_request.barangay_id, v_plan_key, 'active', 14, 0,
    'Manual payment confirmed: ' || v_note, true
  );
  update public.subscription_plan_requests
  set status = 'activated', admin_note = v_note, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = v_request.id;
end;
$$;

create or replace function public.decline_subscription_plan_request(
  p_request_id uuid, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.subscription_plan_requests%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if length(v_reason) not between 3 and 1000 then raise exception 'provide a reason for declining the request'; end if;
  select request.* into v_request from public.subscription_plan_requests request
  where request.id = p_request_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'request is no longer pending'; end if;
  update public.subscription_plan_requests
  set status = 'declined', admin_note = v_reason, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = v_request.id;
end;
$$;

revoke all on function public.list_available_subscription_plans() from public, anon;
revoke all on function public.get_barangay_subscription_plan_status(uuid) from public, anon;
revoke all on function public.list_barangay_subscription_plan_requests(uuid) from public, anon;
revoke all on function public.request_barangay_subscription_plan(uuid, text, text) from public, anon;
revoke all on function public.list_platform_subscription_plan_requests(integer, integer, text) from public, anon;
revoke all on function public.activate_subscription_plan_request(uuid, text) from public, anon;
revoke all on function public.decline_subscription_plan_request(uuid, text) from public, anon;
grant execute on function public.list_available_subscription_plans() to authenticated;
grant execute on function public.get_barangay_subscription_plan_status(uuid) to authenticated;
grant execute on function public.list_barangay_subscription_plan_requests(uuid) to authenticated;
grant execute on function public.request_barangay_subscription_plan(uuid, text, text) to authenticated;
grant execute on function public.list_platform_subscription_plan_requests(integer, integer, text) to authenticated;
grant execute on function public.activate_subscription_plan_request(uuid, text) to authenticated;
grant execute on function public.decline_subscription_plan_request(uuid, text) to authenticated;
