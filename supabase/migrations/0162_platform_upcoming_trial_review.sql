-- Add an early-warning view for trials ending in the next seven days.
create or replace function public.list_platform_subscription_page(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  barangay_id uuid,
  barangay_name text,
  barangay_code text,
  plan_key text,
  plan_name text,
  plan_entitlements jsonb,
  status text,
  started_at timestamptz,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  admin_note text,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if v_status not in ('all', 'needs_review', 'trials_ending_soon', 'free', 'trial', 'active', 'past_due', 'suspended', 'cancelled') then
    raise exception 'invalid subscription status filter';
  end if;

  return query
  with subscription_rows as (
    select barangay.id as barangay_id, barangay.name as barangay_name, barangay.code as barangay_code,
      plan.key as plan_key, plan.name as plan_name, plan.entitlements as plan_entitlements,
      subscription.status, subscription.started_at, subscription.trial_ends_at,
      subscription.grace_ends_at, subscription.admin_note, subscription.updated_at
    from public.subscriptions subscription
    join public.barangays barangay on barangay.id = subscription.barangay_id
    join public.subscription_plans plan on plan.id = subscription.plan_id
    where (v_search is null or position(lower(v_search) in lower(concat_ws(' ', barangay.name, barangay.code, plan.name))) > 0)
      and (v_status = 'all'
        or (v_status = 'needs_review' and (
          subscription.status = 'suspended'
          or (subscription.status = 'trial' and subscription.trial_ends_at <= now())
          or (subscription.status = 'past_due' and subscription.grace_ends_at <= now())
        ))
        or (v_status = 'trials_ending_soon' and subscription.status = 'trial'
          and subscription.trial_ends_at > now()
          and subscription.trial_ends_at <= now() + interval '7 days')
        or subscription.status = v_status)
  ), counted as (
    select subscription_rows.*, count(*) over () as total_count
    from subscription_rows
  )
  select counted.barangay_id, counted.barangay_name, counted.barangay_code,
    counted.plan_key, counted.plan_name, counted.plan_entitlements, counted.status,
    counted.started_at, counted.trial_ends_at, counted.grace_ends_at, counted.admin_note,
    counted.updated_at, counted.total_count
  from counted
  order by counted.barangay_name, counted.barangay_id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_platform_subscription_page(integer, integer, text, text) from public, anon;
grant execute on function public.list_platform_subscription_page(integer, integer, text, text) to authenticated;

-- A return column is added, so recreate this RPC with the same admin-only access boundary.
drop function public.get_platform_subscription_summary();
create function public.get_platform_subscription_summary()
returns table (
  barangay_count bigint,
  active_trial_count bigint,
  elapsed_trial_count bigint,
  past_due_count bigint,
  suspended_count bigint,
  needs_review_count bigint,
  trial_ending_soon_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  return query
  select count(*)::bigint,
    count(*) filter (where subscription.status = 'trial' and subscription.trial_ends_at > now())::bigint,
    count(*) filter (where subscription.status = 'trial' and subscription.trial_ends_at <= now())::bigint,
    count(*) filter (where subscription.status = 'past_due')::bigint,
    count(*) filter (where subscription.status = 'suspended')::bigint,
    count(*) filter (where subscription.status = 'suspended'
      or (subscription.status = 'trial' and subscription.trial_ends_at <= now())
      or (subscription.status = 'past_due' and subscription.grace_ends_at <= now()))::bigint,
    count(*) filter (where subscription.status = 'trial'
      and subscription.trial_ends_at > now()
      and subscription.trial_ends_at <= now() + interval '7 days')::bigint
  from public.subscriptions subscription;
end;
$$;

revoke all on function public.get_platform_subscription_summary() from public, anon;
grant execute on function public.get_platform_subscription_summary() to authenticated;
