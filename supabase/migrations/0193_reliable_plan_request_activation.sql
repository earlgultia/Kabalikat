-- Make manual plan-request activation resilient when an older or manually
-- onboarded barangay is missing its subscription row. Keep the subscription
-- update and request decision in one transaction.
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
  v_plan_key text;
  v_free_plan_id uuid;
  v_note text := trim(coalesce(p_payment_confirmation_note, ''));
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if length(v_note) not between 3 and 950 then
    raise exception 'record how payment was confirmed';
  end if;

  select request.* into v_request
  from public.subscription_plan_requests as request
  where request.id = p_request_id
  for update;
  if not found or v_request.status <> 'pending' then
    raise exception 'request is no longer pending';
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

  perform public.set_platform_subscription(
    v_request.barangay_id,
    v_plan_key,
    'active',
    14,
    0,
    'Manual payment confirmed: ' || v_note,
    true
  );

  update public.subscription_plan_requests
  set status = 'activated',
      admin_note = v_note,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = v_request.id and status = 'pending';

  if not found then
    raise exception 'request status could not be saved';
  end if;
end;
$$;

revoke all on function public.activate_subscription_plan_request(uuid, text) from public, anon;
grant execute on function public.activate_subscription_plan_request(uuid, text) to authenticated;
