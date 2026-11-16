-- Track paid monthly periods for every barangay and require a confirmed payment
-- note before a Super Admin renews or activates a paid plan.
alter table public.subscriptions
  add column if not exists billing_period_started_at timestamptz,
  add column if not exists billing_period_ends_at timestamptz,
  add constraint subscriptions_billing_period_pair_check
    check ((billing_period_started_at is null) = (billing_period_ends_at is null));

alter table public.subscription_events
  add column if not exists from_billing_period_started_at timestamptz,
  add column if not exists to_billing_period_started_at timestamptz,
  add column if not exists from_billing_period_ends_at timestamptz,
  add column if not exists to_billing_period_ends_at timestamptz;

-- Existing active subscriptions begin a recorded period at rollout so they are
-- not unexpectedly treated as overdue from an unknown historical payment date.
update public.subscriptions subscription
set billing_period_started_at = now(), billing_period_ends_at = now() + interval '1 month'
from public.subscription_plans plan
where plan.id = subscription.plan_id and plan.key <> 'free'
  and subscription.status = 'active' and subscription.billing_period_ends_at is null;

create or replace function public.set_platform_subscription(
  p_barangay_id uuid,p_plan_key text,p_status text,p_trial_days integer,p_grace_days integer,p_note text,p_reset_dates boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sub public.subscriptions%rowtype;
  v_updated public.subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_preserve_dates boolean;
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  select * into v_sub from public.subscriptions where barangay_id = p_barangay_id for update;
  if not found then raise exception 'barangay subscription not found'; end if;
  select * into v_plan from public.subscription_plans where key = p_plan_key and (active or id = v_sub.plan_id);
  if not found then raise exception 'active subscription plan not found'; end if;
  if p_status not in ('free','trial','active','past_due','suspended','cancelled')
    or length(trim(coalesce(p_note,''))) not between 3 and 1000 or p_reset_dates is null then
    raise exception 'invalid subscription update';
  end if;
  if p_status = 'free' and v_plan.key <> 'free' then raise exception 'free status requires the Free plan'; end if;
  if p_status = 'trial' and (v_plan.key = 'free' or p_trial_days not between 1 and 90 or p_grace_days not between 0 and 30) then
    raise exception 'trial plan or duration is invalid'; end if;
  if p_status = 'past_due' and p_grace_days not between 0 and 30 then raise exception 'grace period must be between 0 and 30 days'; end if;

  v_preserve_dates := not p_reset_dates and v_sub.plan_id = v_plan.id and v_sub.status = p_status;
  update public.subscriptions set plan_id = v_plan.id,status = p_status,
    started_at = case when v_preserve_dates then v_sub.started_at else now() end,
    trial_ends_at = case when p_status <> 'trial' then null when v_preserve_dates then v_sub.trial_ends_at else now() + make_interval(days => p_trial_days) end,
    grace_ends_at = case when v_preserve_dates then v_sub.grace_ends_at when p_status = 'trial' then now() + make_interval(days => p_trial_days + p_grace_days)
      when p_status = 'past_due' then now() + make_interval(days => p_grace_days) else null end,
    billing_period_started_at = case
      when p_status = 'active' and v_preserve_dates and v_sub.billing_period_ends_at > now() then v_sub.billing_period_started_at
      when p_status = 'active' then now()
      when p_status = 'past_due' then coalesce(v_sub.billing_period_started_at,now())
      else null end,
    billing_period_ends_at = case
      when p_status = 'active' and v_preserve_dates and v_sub.billing_period_ends_at > now() then v_sub.billing_period_ends_at
      when p_status = 'active' then now() + interval '1 month'
      when p_status = 'past_due' then coalesce(v_sub.billing_period_ends_at,now())
      else null end,
    admin_note = trim(p_note),updated_by = (select auth.uid()),updated_at = now()
  where id = v_sub.id returning * into v_updated;

  insert into public.subscription_events(subscription_id,actor_id,action,from_plan,to_plan,from_status,to_status,note,
    from_started_at,to_started_at,from_trial_ends_at,to_trial_ends_at,from_grace_ends_at,to_grace_ends_at,
    from_billing_period_started_at,to_billing_period_started_at,from_billing_period_ends_at,to_billing_period_ends_at)
  values(v_sub.id,(select auth.uid()),case when v_sub.updated_by is null then 'subscription_created' else 'subscription_updated' end,
    (select key from public.subscription_plans where id = v_sub.plan_id),v_plan.key,v_sub.status,p_status,trim(p_note),
    v_sub.started_at,v_updated.started_at,v_sub.trial_ends_at,v_updated.trial_ends_at,v_sub.grace_ends_at,v_updated.grace_ends_at,
    v_sub.billing_period_started_at,v_updated.billing_period_started_at,v_sub.billing_period_ends_at,v_updated.billing_period_ends_at);
end;
$$;

create or replace function public.tenant_plan_feature_enabled(p_barangay_id uuid,p_feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (subscription.status in ('free','trial')
      or (subscription.status = 'active' and (subscription.billing_period_ends_at is null or subscription.billing_period_ends_at > now()))
      or (subscription.status = 'past_due' and subscription.grace_ends_at > now()))
    and (not (coalesce(plan.entitlements,'{}'::jsonb) ?| array['core_services','finance','community_programs','public_safety'])
      or coalesce((plan.entitlements ->> p_feature)::boolean,false)),false)
  from public.subscriptions subscription join public.subscription_plans plan on plan.id = subscription.plan_id
  where subscription.barangay_id = p_barangay_id;
$$;

create or replace function public.get_barangay_monthly_subscription_period(p_barangay_id uuid)
returns table(plan_key text,plan_name text,status text,billing_period_started_at timestamptz,billing_period_ends_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'membership.manage') then raise exception 'not authorized'; end if;
  return query select plan.key,plan.name,subscription.status,subscription.billing_period_started_at,subscription.billing_period_ends_at,subscription.updated_at
    from public.subscriptions subscription join public.subscription_plans plan on plan.id = subscription.plan_id
    where subscription.barangay_id = p_barangay_id;
end;
$$;

create or replace function public.request_barangay_subscription_plan(p_barangay_id uuid,p_plan_key text,p_request_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_current_plan_key text;
  v_current_status text;
  v_period_ends_at timestamptz;
  v_request_id uuid;
  v_note text := trim(coalesce(p_request_note,''));
begin
  if not public.has_tenant_permission(p_barangay_id,'membership.manage') then raise exception 'not authorized'; end if;
  if length(v_note) > 500 then raise exception 'request note is too long'; end if;
  perform 1 from public.barangays where id = p_barangay_id for update;
  if not found then raise exception 'barangay not found'; end if;
  select plan.* into v_plan from public.subscription_plans plan where plan.key = p_plan_key and plan.active and plan.key <> 'free';
  if not found then raise exception 'selected subscription plan is unavailable'; end if;
  select plan.key,subscription.status,subscription.billing_period_ends_at
    into v_current_plan_key,v_current_status,v_period_ends_at
  from public.subscriptions subscription join public.subscription_plans plan on plan.id = subscription.plan_id
  where subscription.barangay_id = p_barangay_id;
  if not found then raise exception 'barangay subscription record not found'; end if;
  if v_current_status = 'active' and v_current_plan_key = v_plan.key
    and v_period_ends_at is not null and v_period_ends_at > now() + interval '7 days' then
    raise exception 'this plan is already active; a monthly renewal request can be submitted during its final seven days';
  end if;
  if exists(select 1 from public.subscription_plan_requests request where request.barangay_id = p_barangay_id and request.status = 'pending') then
    raise exception 'a plan request is already awaiting review';
  end if;
  insert into public.subscription_plan_requests(barangay_id,requested_plan_id,requested_by,request_note)
  values(p_barangay_id,v_plan.id,(select auth.uid()),v_note) returning id into v_request_id;
  return v_request_id;
end;
$$;

drop function public.activate_subscription_plan_request(uuid);
create function public.activate_subscription_plan_request(p_request_id uuid,p_payment_confirmation_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.subscription_plan_requests%rowtype; v_plan_key text; v_note text := trim(coalesce(p_payment_confirmation_note,''));
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if length(v_note) not between 3 and 950 then raise exception 'record how monthly payment was confirmed'; end if;
  select request.* into v_request from public.subscription_plan_requests request where request.id = p_request_id for update;
  if not found then raise exception 'plan request was not found'; end if;
  if v_request.status = 'activated' then return; end if;
  if v_request.status <> 'pending' then raise exception 'this request was already declined'; end if;
  select plan.key into v_plan_key from public.subscription_plans plan where plan.id = v_request.requested_plan_id and plan.active and plan.key <> 'free';
  if not found then raise exception 'requested plan is no longer available'; end if;
  perform public.set_platform_subscription(v_request.barangay_id,v_plan_key,'active',14,0,
    'Monthly payment confirmed: ' || v_note,true);
  update public.subscription_plan_requests set status = 'activated',admin_note = 'Monthly payment confirmed: ' || v_note,
    reviewed_by = (select auth.uid()),reviewed_at = now() where id = v_request.id and status = 'pending';
  if not found then raise exception 'request status could not be saved'; end if;
end;
$$;

revoke all on function public.set_platform_subscription(uuid,text,text,integer,integer,text,boolean) from public,anon;
grant execute on function public.set_platform_subscription(uuid,text,text,integer,integer,text,boolean) to authenticated;
revoke all on function public.tenant_plan_feature_enabled(uuid,text) from public,anon,authenticated;
revoke all on function public.get_barangay_monthly_subscription_period(uuid) from public,anon;
grant execute on function public.get_barangay_monthly_subscription_period(uuid) to authenticated;
revoke all on function public.request_barangay_subscription_plan(uuid,text,text) from public,anon;
grant execute on function public.request_barangay_subscription_plan(uuid,text,text) to authenticated;
revoke all on function public.activate_subscription_plan_request(uuid,text) from public,anon;
grant execute on function public.activate_subscription_plan_request(uuid,text) to authenticated;
