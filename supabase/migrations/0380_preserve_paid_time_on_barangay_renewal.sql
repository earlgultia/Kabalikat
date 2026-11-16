-- Preserve the current paid-through period when a Captain's monthly plan is
-- renewed or changed before it expires. Expired plans and trials start now.
create or replace function public.activate_subscription_plan_request(
  p_request_id uuid,
  p_payment_confirmation_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.subscription_plan_requests%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_current_plan_key text;
  v_requested_plan_key text;
  v_period_start timestamptz := now();
  v_period_end timestamptz;
  v_note text := trim(coalesce(p_payment_confirmation_note,''));
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if length(v_note) not between 3 and 950 then
    raise exception 'record how monthly payment was confirmed';
  end if;

  select request.* into v_request
  from public.subscription_plan_requests request
  where request.id = p_request_id
  for update;
  if not found then
    raise exception 'plan request was not found';
  end if;
  if v_request.status = 'activated' then
    return;
  end if;
  if v_request.status <> 'pending' then
    raise exception 'this request was already declined';
  end if;

  select plan.key into v_requested_plan_key
  from public.subscription_plans plan
  where plan.id = v_request.requested_plan_id
    and plan.active
    and plan.key <> 'free';
  if not found then
    raise exception 'requested plan is no longer available';
  end if;

  select subscription.* into v_subscription
  from public.subscriptions subscription
  where subscription.barangay_id = v_request.barangay_id
  for update;
  if not found then
    raise exception 'barangay subscription record not found';
  end if;

  select plan.key into v_current_plan_key
  from public.subscription_plans plan
  where plan.id = v_subscription.plan_id;
  if v_subscription.billing_period_ends_at > v_period_start then
    v_period_start := v_subscription.billing_period_ends_at;
  end if;
  v_period_end := v_period_start + interval '1 month';

  update public.subscriptions
  set plan_id = v_request.requested_plan_id,
      status = 'active',
      started_at = now(),
      trial_ends_at = null,
      grace_ends_at = null,
      billing_period_started_at = v_period_start,
      billing_period_ends_at = v_period_end,
      admin_note = 'Monthly payment confirmed: ' || v_note,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = v_subscription.id;

  insert into public.subscription_events(
    subscription_id,actor_id,action,from_plan,to_plan,from_status,to_status,note,
    from_started_at,to_started_at,from_trial_ends_at,to_trial_ends_at,
    from_grace_ends_at,to_grace_ends_at,
    from_billing_period_started_at,to_billing_period_started_at,
    from_billing_period_ends_at,to_billing_period_ends_at
  ) values (
    v_subscription.id,(select auth.uid()),
    case when v_subscription.updated_by is null then 'subscription_created' else 'subscription_updated' end,
    v_current_plan_key,v_requested_plan_key,v_subscription.status,'active',
    'Monthly payment confirmed: ' || v_note,
    v_subscription.started_at,now(),v_subscription.trial_ends_at,null,
    v_subscription.grace_ends_at,null,
    v_subscription.billing_period_started_at,v_period_start,
    v_subscription.billing_period_ends_at,v_period_end
  );

  update public.subscription_plan_requests
  set status = 'activated',
      admin_note = 'Monthly payment confirmed: ' || v_note,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = v_request.id and status = 'pending';
  if not found then
    raise exception 'request status could not be saved';
  end if;
end;
$$;

revoke all on function public.activate_subscription_plan_request(uuid,text) from public,anon;
grant execute on function public.activate_subscription_plan_request(uuid,text) to authenticated;
