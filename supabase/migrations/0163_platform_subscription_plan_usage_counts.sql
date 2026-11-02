-- Show plan assignment totals to platform administrators before changing availability.
drop function public.get_platform_subscription_plans();
create function public.get_platform_subscription_plans()
returns table (
  id uuid,
  key text,
  name text,
  description text,
  entitlements jsonb,
  active boolean,
  assigned_barangay_count bigint
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
  select plan.id, plan.key, plan.name, plan.description, plan.entitlements, plan.active,
    (select count(*)::bigint from public.subscriptions subscription where subscription.plan_id = plan.id)
  from public.subscription_plans plan
  order by plan.name, plan.id;
end;
$$;

revoke all on function public.get_platform_subscription_plans() from public, anon;
grant execute on function public.get_platform_subscription_plans() to authenticated;
