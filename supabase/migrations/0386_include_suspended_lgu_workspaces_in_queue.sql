-- Keep workspace suspension visible in the LGU subscription review queue,
-- while retaining the independent subscription billing status in each row.
create or replace function public.list_platform_lgu_subscription_status(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  lgu_id uuid,
  municipality text,
  province text,
  lgu_status text,
  plan_key text,
  plan_name text,
  subscription_status text,
  period_started_at timestamptz,
  period_ends_at timestamptz,
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
  v_page integer := least(greatest(coalesce(p_page,0),0),1000000);
  v_page_size integer := least(greatest(coalesce(p_page_size,25),1),100);
  v_search text := nullif(left(trim(coalesce(p_search,'')),100),'');
  v_status text := coalesce(nullif(p_status,''),'all');
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if v_status not in ('all','active','ending_soon','past_due','suspended','no_subscription') then
    raise exception 'invalid LGU subscription status filter';
  end if;

  return query
  with lgu_rows as (
    select lgu.id as lgu_id,
      lgu.municipality,
      lgu.province,
      lgu.status as lgu_status,
      plan.key as plan_key,
      plan.name as plan_name,
      subscription.status as subscription_status,
      subscription.period_started_at,
      subscription.period_ends_at,
      subscription.admin_note,
      subscription.updated_at
    from public.local_government_units lgu
    left join public.lgu_subscriptions subscription on subscription.lgu_id = lgu.id
    left join public.subscription_plans plan on plan.id = subscription.plan_id
    where (v_search is null or position(lower(v_search) in lower(concat_ws(' ',lgu.municipality,lgu.province,plan.name))) > 0)
      and (
        v_status = 'all'
        or (v_status = 'no_subscription' and subscription.lgu_id is null)
        or (v_status = 'suspended' and (lgu.status = 'suspended' or subscription.status = 'suspended'))
        or (v_status = 'past_due' and (
          subscription.status = 'past_due'
          or (subscription.status = 'active' and subscription.period_ends_at <= now())
        ))
        or (v_status = 'ending_soon' and lgu.status = 'active' and subscription.status = 'active'
          and subscription.period_ends_at > now()
          and subscription.period_ends_at <= now() + interval '7 days')
        or (v_status = 'active' and lgu.status = 'active' and subscription.status = 'active'
          and subscription.period_ends_at > now())
      )
  ), counted as (
    select lgu_rows.*,count(*) over() as total_count
    from lgu_rows
  )
  select counted.lgu_id,counted.municipality,counted.province,counted.lgu_status,
    counted.plan_key,counted.plan_name,
    case
      when counted.subscription_status = 'active' and counted.period_ends_at <= now() then 'past_due'
      else counted.subscription_status
    end,
    counted.period_started_at,counted.period_ends_at,counted.admin_note,counted.updated_at,counted.total_count
  from counted
  order by case when counted.lgu_status = 'suspended' then 0
                when counted.subscription_status = 'active' and counted.period_ends_at <= now() then 1
                when counted.subscription_status = 'past_due' then 2
                when counted.subscription_status is null then 3
                else 4 end,
    counted.municipality,counted.province,counted.lgu_id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

create or replace function public.get_platform_lgu_subscription_summary()
returns table (
  municipality_count bigint,
  active_count bigint,
  ending_soon_count bigint,
  past_due_count bigint,
  suspended_count bigint,
  no_subscription_count bigint
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
    count(*) filter (where lgu.status = 'active' and subscription.status = 'active'
      and subscription.period_ends_at > now())::bigint,
    count(*) filter (where lgu.status = 'active' and subscription.status = 'active'
      and subscription.period_ends_at > now()
      and subscription.period_ends_at <= now() + interval '7 days')::bigint,
    count(*) filter (where subscription.status = 'past_due'
      or (subscription.status = 'active' and subscription.period_ends_at <= now()))::bigint,
    count(*) filter (where lgu.status = 'suspended' or subscription.status = 'suspended')::bigint,
    count(*) filter (where subscription.lgu_id is null)::bigint
  from public.local_government_units lgu
  left join public.lgu_subscriptions subscription on subscription.lgu_id = lgu.id;
end;
$$;

revoke all on function public.list_platform_lgu_subscription_status(integer,integer,text,text) from public,anon;
revoke all on function public.get_platform_lgu_subscription_summary() from public,anon;
grant execute on function public.list_platform_lgu_subscription_status(integer,integer,text,text) to authenticated;
grant execute on function public.get_platform_lgu_subscription_summary() to authenticated;
