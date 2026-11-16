-- Track monthly LGU subscriptions separately from each barangay subscription.
create table public.lgu_subscriptions (
  id uuid primary key default gen_random_uuid(),
  lgu_id uuid not null unique references public.local_government_units(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'active' check (status in ('active','past_due','suspended','cancelled')),
  period_started_at timestamptz not null default now(),
  period_ends_at timestamptz not null,
  admin_note text not null default '' check (length(admin_note) <= 1000),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (period_ends_at > period_started_at)
);
create index lgu_subscriptions_status_idx on public.lgu_subscriptions(status,period_ends_at);

create table public.lgu_subscription_plan_requests (
  id uuid primary key default gen_random_uuid(),
  lgu_id uuid not null references public.local_government_units(id) on delete restrict,
  requested_plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','activated','declined')),
  request_note text not null default '' check (length(request_note) <= 500),
  admin_note text not null default '' check (length(admin_note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (reviewed_at is null)),
  check ((status = 'pending') = (reviewed_by is null))
);
create unique index lgu_subscription_plan_requests_one_pending_idx
  on public.lgu_subscription_plan_requests(lgu_id) where status = 'pending';
create index lgu_subscription_plan_requests_queue_idx
  on public.lgu_subscription_plan_requests(status,created_at desc,id desc);

alter table public.lgu_subscriptions enable row level security;
alter table public.lgu_subscription_plan_requests enable row level security;
revoke all on public.lgu_subscriptions,public.lgu_subscription_plan_requests from public,anon,authenticated;

create or replace function public.get_lgu_monthly_subscription()
returns table(plan_key text,plan_name text,status text,period_started_at timestamptz,period_ends_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  if v_lgu_id is null then raise exception 'active LGU administrator access is required'; end if;
  return query select plan.key,plan.name,subscription.status,subscription.period_started_at,subscription.period_ends_at,subscription.updated_at
    from public.lgu_subscriptions subscription
    join public.subscription_plans plan on plan.id = subscription.plan_id
    where subscription.lgu_id = v_lgu_id;
end;
$$;

create or replace function public.list_lgu_monthly_subscription_requests()
returns table(request_id uuid,plan_key text,plan_name text,status text,request_note text,admin_note text,created_at timestamptz,reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  if v_lgu_id is null then raise exception 'active LGU administrator access is required'; end if;
  return query select request.id,plan.key,plan.name,request.status,request.request_note,request.admin_note,request.created_at,request.reviewed_at
    from public.lgu_subscription_plan_requests request
    join public.subscription_plans plan on plan.id = request.requested_plan_id
    where request.lgu_id = v_lgu_id order by request.created_at desc,request.id desc limit 50;
end;
$$;

create or replace function public.request_lgu_monthly_subscription(p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_lgu_id uuid; v_plan_id uuid; v_request_id uuid; v_note text := trim(coalesce(p_note,''));
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  if v_lgu_id is null then raise exception 'active LGU administrator access is required'; end if;
  if length(v_note) > 500 then raise exception 'request note is too long'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_lgu_id::text,37201));
  select plan.id into v_plan_id from public.subscription_plans plan where plan.key = 'enterprise' and plan.active;
  if v_plan_id is null then raise exception 'the monthly LGU plan is currently unavailable'; end if;
  if exists(select 1 from public.lgu_subscription_plan_requests request where request.lgu_id = v_lgu_id and request.status = 'pending') then
    raise exception 'a monthly LGU subscription request is already awaiting review';
  end if;
  insert into public.lgu_subscription_plan_requests(lgu_id,requested_plan_id,requested_by,request_note)
  values(v_lgu_id,v_plan_id,(select auth.uid()),v_note) returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.list_platform_lgu_subscription_requests(
  p_page integer default 0,p_page_size integer default 20,p_status text default 'pending'
) returns table(request_id uuid,lgu_id uuid,municipality text,province text,plan_key text,plan_name text,
  requester_name text,request_note text,status text,admin_note text,created_at timestamptz,reviewed_at timestamptz,total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_page integer := least(greatest(coalesce(p_page,0),0),1000000); v_size integer := least(greatest(coalesce(p_page_size,20),1),100); v_status text := coalesce(nullif(p_status,''),'pending');
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if v_status not in ('all','pending','activated','declined') then raise exception 'invalid subscription request filter'; end if;
  return query with filtered as (
    select request.id,request.lgu_id,lgu.municipality,lgu.province,plan.key,plan.name,
      coalesce(nullif(profile.display_name,''),'LGU administrator') as requester_name,
      request.request_note,request.status,request.admin_note,request.created_at,request.reviewed_at
    from public.lgu_subscription_plan_requests request
    join public.local_government_units lgu on lgu.id = request.lgu_id
    join public.subscription_plans plan on plan.id = request.requested_plan_id
    left join public.profiles profile on profile.id = request.requested_by
    where v_status = 'all' or request.status = v_status
  ),counted as (select filtered.*,count(*) over() as total_count from filtered)
  select counted.id,counted.lgu_id,counted.municipality,counted.province,counted.key,counted.name,
    counted.requester_name,counted.request_note,counted.status,counted.admin_note,counted.created_at,counted.reviewed_at,counted.total_count
  from counted order by case when v_status = 'pending' then counted.created_at end asc,
    case when v_status <> 'pending' then counted.created_at end desc,counted.id desc
  offset v_page::bigint * v_size limit v_size;
end;
$$;

create or replace function public.activate_lgu_monthly_subscription_request(p_request_id uuid,p_payment_confirmation_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.lgu_subscription_plan_requests%rowtype; v_period_start timestamptz := now(); v_period_end timestamptz := now() + interval '1 month'; v_payment_note text := trim(coalesce(p_payment_confirmation_note,''));
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if length(v_payment_note) not between 3 and 950 then raise exception 'record how monthly payment was confirmed'; end if;
  select request.* into v_request from public.lgu_subscription_plan_requests request where request.id = p_request_id for update;
  if not found then raise exception 'LGU subscription request was not found'; end if;
  if v_request.status = 'activated' then return; end if;
  if v_request.status <> 'pending' then raise exception 'this request was already declined'; end if;
  if not exists(select 1 from public.subscription_plans plan where plan.id = v_request.requested_plan_id and plan.key = 'enterprise' and plan.active) then
    raise exception 'the requested monthly LGU plan is no longer available';
  end if;
  insert into public.lgu_subscriptions(lgu_id,plan_id,status,period_started_at,period_ends_at,updated_by,updated_at)
  values(v_request.lgu_id,v_request.requested_plan_id,'active',v_period_start,v_period_end,(select auth.uid()),now())
  on conflict(lgu_id) do update set plan_id = excluded.plan_id,status = 'active',period_started_at = excluded.period_started_at,
    period_ends_at = excluded.period_ends_at,admin_note = '',updated_by = excluded.updated_by,updated_at = excluded.updated_at;
  update public.lgu_subscription_plan_requests set status = 'activated',admin_note = 'Monthly payment confirmed: ' || v_payment_note,
    reviewed_by = (select auth.uid()),reviewed_at = now() where id = v_request.id and status = 'pending';
  if not found then raise exception 'LGU subscription request status could not be saved'; end if;
end;
$$;

create or replace function public.decline_lgu_monthly_subscription_request(p_request_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_reason text := trim(coalesce(p_reason,''));
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if length(v_reason) not between 3 and 1000 then raise exception 'provide a reason for declining this request'; end if;
  update public.lgu_subscription_plan_requests set status = 'declined',admin_note = v_reason,reviewed_by = (select auth.uid()),reviewed_at = now()
  where id = p_request_id and status = 'pending';
  if not found then raise exception 'LGU subscription request is no longer pending'; end if;
end;
$$;

revoke all on function public.get_lgu_monthly_subscription() from public,anon;
revoke all on function public.list_lgu_monthly_subscription_requests() from public,anon;
revoke all on function public.request_lgu_monthly_subscription(text) from public,anon;
revoke all on function public.list_platform_lgu_subscription_requests(integer,integer,text) from public,anon;
revoke all on function public.activate_lgu_monthly_subscription_request(uuid,text) from public,anon;
revoke all on function public.decline_lgu_monthly_subscription_request(uuid,text) from public,anon;
grant execute on function public.get_lgu_monthly_subscription() to authenticated;
grant execute on function public.list_lgu_monthly_subscription_requests() to authenticated;
grant execute on function public.request_lgu_monthly_subscription(text) to authenticated;
grant execute on function public.list_platform_lgu_subscription_requests(integer,integer,text) to authenticated;
grant execute on function public.activate_lgu_monthly_subscription_request(uuid,text) to authenticated;
grant execute on function public.decline_lgu_monthly_subscription_request(uuid,text) to authenticated;
