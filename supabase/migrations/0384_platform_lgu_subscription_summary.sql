-- Summarize municipal subscription health for the platform subscription page.
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
    count(*) filter (where subscription.status = 'active' and subscription.period_ends_at > now())::bigint,
    count(*) filter (where subscription.status = 'active'
      and subscription.period_ends_at > now()
      and subscription.period_ends_at <= now() + interval '7 days')::bigint,
    count(*) filter (where subscription.status = 'past_due'
      or (subscription.status = 'active' and subscription.period_ends_at <= now()))::bigint,
    count(*) filter (where subscription.status = 'suspended')::bigint,
    count(*) filter (where subscription.lgu_id is null)::bigint
  from public.local_government_units lgu
  left join public.lgu_subscriptions subscription on subscription.lgu_id = lgu.id;
end;
$$;

revoke all on function public.get_platform_lgu_subscription_summary() from public,anon;
grant execute on function public.get_platform_lgu_subscription_summary() to authenticated;
