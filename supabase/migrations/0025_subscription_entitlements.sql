-- Phase 6: configurable plan metadata and platform-admin-managed subscription states.
-- This migration does not process payment or gate tenant access.
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null default '',
  entitlements jsonb not null default '{}'::jsonb check (jsonb_typeof(entitlements) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  check (length(trim(name)) between 2 and 100),
  check (length(description) <= 1000)
);
insert into public.subscription_plans(key,name,description,entitlements) values
  ('free','Free','Base plan. Feature entitlements are not configured yet.','{}'::jsonb),
  ('pro','Pro','Paid plan catalog entry. Pricing and included features require configuration.','{}'::jsonb),
  ('enterprise','Enterprise / LGU','Organization plan catalog entry. Pricing and included features require configuration.','{}'::jsonb)
on conflict (key) do nothing;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null unique references public.barangays(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'free' check (status in ('free','trial','active','past_due','suspended','cancelled')),
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  admin_note text not null default '',
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check ((status = 'trial') = (trial_ends_at is not null)),
  check (grace_ends_at is null or trial_ends_at is not null or status = 'past_due'),
  check (length(admin_note) <= 1000)
);
create index subscriptions_status_idx on public.subscriptions(status,updated_at desc);

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('subscription_created','subscription_updated')),
  from_plan text,
  to_plan text not null,
  from_status text,
  to_status text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index subscription_events_history_idx on public.subscription_events(subscription_id,created_at);

create or replace function public.ensure_barangay_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions(barangay_id,plan_id,status)
  select new.id,p.id,'free' from public.subscription_plans p where p.key = 'free'
  on conflict (barangay_id) do nothing;
  return new;
end;
$$;
create trigger barangay_subscription_after_insert after insert on public.barangays
for each row execute function public.ensure_barangay_subscription();
insert into public.subscriptions(barangay_id,plan_id,status)
select b.id,p.id,'free' from public.barangays b cross join public.subscription_plans p where p.key = 'free'
on conflict (barangay_id) do nothing;

create or replace function public.get_platform_subscription_plans()
returns table (id uuid,key text,name text,description text,entitlements jsonb,active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  return query select p.id,p.key,p.name,p.description,p.entitlements,p.active from public.subscription_plans p order by p.name;
end;
$$;

create or replace function public.get_platform_subscription_overview()
returns table (
  barangay_id uuid,barangay_name text,barangay_code text,plan_key text,plan_name text,plan_entitlements jsonb,
  status text,started_at timestamptz,trial_ends_at timestamptz,grace_ends_at timestamptz,admin_note text,updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  return query select b.id,b.name,b.code,p.key,p.name,p.entitlements,s.status,s.started_at,s.trial_ends_at,s.grace_ends_at,s.admin_note,s.updated_at
    from public.subscriptions s join public.barangays b on b.id = s.barangay_id
    join public.subscription_plans p on p.id = s.plan_id order by b.name;
end;
$$;

create or replace function public.set_platform_subscription(
  p_barangay_id uuid,p_plan_key text,p_status text,p_trial_days integer default 14,p_grace_days integer default 7,p_note text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare v_sub public.subscriptions%rowtype; v_plan public.subscription_plans%rowtype;
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  select * into v_plan from public.subscription_plans where key = p_plan_key and active;
  if not found then raise exception 'active subscription plan not found'; end if;
  if p_status not in ('free','trial','active','past_due','suspended','cancelled')
    or length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'invalid subscription update'; end if;
  if p_status = 'free' and v_plan.key <> 'free' then raise exception 'free status requires the Free plan'; end if;
  if p_status = 'trial' and (v_plan.key = 'free' or p_trial_days not between 1 and 90 or p_grace_days not between 0 and 30) then
    raise exception 'trial plan or duration is invalid'; end if;
  if p_status = 'past_due' and p_grace_days not between 0 and 30 then raise exception 'grace period must be between 0 and 30 days'; end if;
  select * into v_sub from public.subscriptions where barangay_id = p_barangay_id for update;
  if not found then raise exception 'barangay subscription not found'; end if;
  update public.subscriptions set plan_id = v_plan.id,status = p_status,started_at = now(),
    trial_ends_at = case when p_status = 'trial' then now() + make_interval(days => p_trial_days) else null end,
    grace_ends_at = case when p_status = 'trial' then now() + make_interval(days => p_trial_days + p_grace_days)
      when p_status = 'past_due' then now() + make_interval(days => p_grace_days) else null end,
    admin_note = trim(p_note),updated_by = auth.uid(),updated_at = now()
    where id = v_sub.id;
  insert into public.subscription_events(subscription_id,actor_id,action,from_plan,to_plan,from_status,to_status,note)
    values (v_sub.id,auth.uid(),case when v_sub.updated_by is null then 'subscription_created' else 'subscription_updated' end,
      (select key from public.subscription_plans where id = v_sub.plan_id),v_plan.key,v_sub.status,p_status,trim(p_note));
end;
$$;

alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
create policy subscription_plans_admin_read on public.subscription_plans for select to authenticated using (public.is_platform_administrator());
create policy subscriptions_admin_read on public.subscriptions for select to authenticated using (public.is_platform_administrator());
create policy subscription_events_admin_read on public.subscription_events for select to authenticated using (public.is_platform_administrator());
revoke all on public.subscription_plans,public.subscriptions,public.subscription_events from anon,authenticated;
grant select on public.subscription_plans,public.subscriptions,public.subscription_events to authenticated;
revoke all on function public.ensure_barangay_subscription() from public,anon,authenticated;
revoke all on function public.get_platform_subscription_plans() from public,anon;
revoke all on function public.get_platform_subscription_overview() from public,anon;
revoke all on function public.set_platform_subscription(uuid,text,text,integer,integer,text) from public,anon;
grant execute on function public.get_platform_subscription_plans() to authenticated;
grant execute on function public.get_platform_subscription_overview() to authenticated;
grant execute on function public.set_platform_subscription(uuid,text,text,integer,integer,text) to authenticated;
