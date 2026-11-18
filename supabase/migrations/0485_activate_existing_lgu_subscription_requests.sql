-- Honor an already-submitted LGU request even if the plan was later hidden
-- from new requests. Activation remains restricted to platform administrators
-- and to requests for the Enterprise LGU plan.
create or replace function public.activate_lgu_monthly_subscription_request(
  p_request_id uuid,
  p_payment_confirmation_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.lgu_subscription_plan_requests%rowtype;
  v_current_period_end timestamptz;
  v_period_start timestamptz := now();
  v_period_end timestamptz;
  v_payment_note text := trim(coalesce(p_payment_confirmation_note, ''));
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  if length(v_payment_note) not between 3 and 950 then
    raise exception 'record how monthly payment was confirmed';
  end if;

  select request.*
  into v_request
  from public.lgu_subscription_plan_requests as request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception 'LGU subscription request was not found';
  end if;

  -- Makes retries safe when a request was activated by another admin or the
  -- client lost its connection after the transaction committed.
  if v_request.status = 'activated' then
    return;
  end if;
  if v_request.status <> 'pending' then
    raise exception 'this request was already declined';
  end if;

  -- The request holds the plan selected when it was submitted. The active
  -- flag controls new requests; it should not invalidate a pending request
  -- that a platform administrator is now approving.
  if not exists (
    select 1
    from public.subscription_plans as plan
    where plan.id = v_request.requested_plan_id
      and plan.key = 'enterprise'
  ) then
    raise exception 'the requested LGU plan is invalid';
  end if;

  select subscription.period_ends_at
  into v_current_period_end
  from public.lgu_subscriptions as subscription
  where subscription.lgu_id = v_request.lgu_id
  for update;

  if v_current_period_end > v_period_start then
    v_period_start := v_current_period_end;
  end if;
  v_period_end := v_period_start + interval '1 month';

  insert into public.lgu_subscriptions (
    lgu_id, plan_id, status, period_started_at, period_ends_at, updated_by, updated_at
  ) values (
    v_request.lgu_id, v_request.requested_plan_id, 'active', v_period_start,
    v_period_end, (select auth.uid()), now()
  )
  on conflict (lgu_id) do update set
    plan_id = excluded.plan_id,
    status = 'active',
    period_started_at = excluded.period_started_at,
    period_ends_at = excluded.period_ends_at,
    admin_note = '',
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  update public.lgu_subscription_plan_requests
  set status = 'activated',
      admin_note = 'Monthly payment confirmed: ' || v_payment_note,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = v_request.id
    and status = 'pending';

  if not found then
    raise exception 'LGU subscription request status could not be saved';
  end if;
end;
$$;

revoke all on function public.activate_lgu_monthly_subscription_request(uuid, text) from public, anon;
grant execute on function public.activate_lgu_monthly_subscription_request(uuid, text) to authenticated;
