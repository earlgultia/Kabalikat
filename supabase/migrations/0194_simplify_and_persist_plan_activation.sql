-- Replace the payment-note activation flow with a direct, audited manual
-- activation. A matching plan that is already active still completes its
-- pending request so the item cannot remain in the review queue.
drop function if exists public.activate_subscription_plan_request(uuid, text);

create or replace function public.activate_subscription_plan_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.subscription_plan_requests%rowtype;
  v_plan_key text;
  v_free_plan_id uuid;
  v_current_plan_id uuid;
  v_current_status text;
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  select request.* into v_request
  from public.subscription_plan_requests as request
  where request.id = p_request_id
  for update;
  if not found then
    raise exception 'plan request was not found';
  end if;
  if v_request.status <> 'pending' then
    -- A repeated click after a successful decision is safe and does not
    -- recreate a pending item or duplicate the subscription audit entry.
    if v_request.status = 'activated' then return; end if;
    raise exception 'this request was already declined';
  end if;

  select plan.key into v_plan_key
  from public.subscription_plans as plan
  where plan.id = v_request.requested_plan_id
    and plan.active
    and plan.key <> 'free';
  if not found then
    raise exception 'requested plan is no longer available';
  end if;

  select plan.id into v_free_plan_id
  from public.subscription_plans as plan
  where plan.key = 'free';
  if v_free_plan_id is null then
    raise exception 'Free plan is not configured';
  end if;

  insert into public.subscriptions(barangay_id, plan_id, status)
  values (v_request.barangay_id, v_free_plan_id, 'free')
  on conflict (barangay_id) do nothing;

  select subscription.plan_id, subscription.status
    into v_current_plan_id, v_current_status
  from public.subscriptions as subscription
  where subscription.barangay_id = v_request.barangay_id
  for update;

  -- If the admin already activated this exact plan from the subscriptions
  -- page, finish the request instead of applying the same change twice.
  if v_current_plan_id is distinct from v_request.requested_plan_id
     or v_current_status is distinct from 'active' then
    perform public.set_platform_subscription(
      v_request.barangay_id,
      v_plan_key,
      'active',
      14,
      0,
      'Plan request manually activated by Super Admin',
      true
    );
  end if;

  update public.subscription_plan_requests
  set status = 'activated',
      admin_note = 'Plan manually activated by Super Admin.',
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = v_request.id and status = 'pending';

  if not found then
    raise exception 'request status could not be saved';
  end if;
end;
$$;

revoke all on function public.activate_subscription_plan_request(uuid) from public, anon;
grant execute on function public.activate_subscription_plan_request(uuid) to authenticated;
