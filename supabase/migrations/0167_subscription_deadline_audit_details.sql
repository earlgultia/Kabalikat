-- Store the before/after date values for every admin-managed subscription update.
alter table public.subscription_events
  add column if not exists from_started_at timestamptz,
  add column if not exists to_started_at timestamptz,
  add column if not exists from_trial_ends_at timestamptz,
  add column if not exists to_trial_ends_at timestamptz,
  add column if not exists from_grace_ends_at timestamptz,
  add column if not exists to_grace_ends_at timestamptz;

create or replace function public.set_platform_subscription(
  p_barangay_id uuid,
  p_plan_key text,
  p_status text,
  p_trial_days integer,
  p_grace_days integer,
  p_note text,
  p_reset_dates boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_updated public.subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_preserve_dates boolean;
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  select * into v_sub
  from public.subscriptions
  where barangay_id = p_barangay_id
  for update;
  if not found then
    raise exception 'barangay subscription not found';
  end if;

  select * into v_plan
  from public.subscription_plans
  where key = p_plan_key
    and (active or id = v_sub.plan_id);
  if not found then
    raise exception 'active subscription plan not found';
  end if;
  if p_status not in ('free', 'trial', 'active', 'past_due', 'suspended', 'cancelled')
    or length(trim(coalesce(p_note, ''))) not between 3 and 1000
    or p_reset_dates is null then
    raise exception 'invalid subscription update';
  end if;
  if p_status = 'free' and v_plan.key <> 'free' then
    raise exception 'free status requires the Free plan';
  end if;
  if p_status = 'trial' and (v_plan.key = 'free' or p_trial_days not between 1 and 90 or p_grace_days not between 0 and 30) then
    raise exception 'trial plan or duration is invalid';
  end if;
  if p_status = 'past_due' and p_grace_days not between 0 and 30 then
    raise exception 'grace period must be between 0 and 30 days';
  end if;

  v_preserve_dates := not p_reset_dates
    and v_sub.plan_id = v_plan.id
    and v_sub.status = p_status;

  update public.subscriptions
  set plan_id = v_plan.id,
      status = p_status,
      started_at = case when v_preserve_dates then v_sub.started_at else now() end,
      trial_ends_at = case
        when p_status <> 'trial' then null
        when v_preserve_dates then v_sub.trial_ends_at
        else now() + make_interval(days => p_trial_days)
      end,
      grace_ends_at = case
        when v_preserve_dates then v_sub.grace_ends_at
        when p_status = 'trial' then now() + make_interval(days => p_trial_days + p_grace_days)
        when p_status = 'past_due' then now() + make_interval(days => p_grace_days)
        else null
      end,
      admin_note = trim(p_note),
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_sub.id
  returning * into v_updated;

  insert into public.subscription_events(
    subscription_id, actor_id, action, from_plan, to_plan, from_status, to_status, note,
    from_started_at, to_started_at, from_trial_ends_at, to_trial_ends_at,
    from_grace_ends_at, to_grace_ends_at
  )
  values (
    v_sub.id,
    auth.uid(),
    case when v_sub.updated_by is null then 'subscription_created' else 'subscription_updated' end,
    (select key from public.subscription_plans where id = v_sub.plan_id),
    v_plan.key,
    v_sub.status,
    p_status,
    trim(p_note),
    v_sub.started_at,
    v_updated.started_at,
    v_sub.trial_ends_at,
    v_updated.trial_ends_at,
    v_sub.grace_ends_at,
    v_updated.grace_ends_at
  );
end;
$$;

revoke all on function public.set_platform_subscription(uuid, text, text, integer, integer, text, boolean) from public, anon;
grant execute on function public.set_platform_subscription(uuid, text, text, integer, integer, text, boolean) to authenticated;
