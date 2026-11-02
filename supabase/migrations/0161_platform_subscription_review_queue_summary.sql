-- Keep the platform summary's review count aligned with the review queue filter.
create or replace function public.get_platform_subscription_summary()
returns table (
  barangay_count bigint,
  active_trial_count bigint,
  elapsed_trial_count bigint,
  past_due_count bigint,
  suspended_count bigint,
  needs_review_count bigint
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
      or (subscription.status = 'past_due' and subscription.grace_ends_at <= now()))::bigint
  from public.subscriptions subscription;
end;
$$;

revoke all on function public.get_platform_subscription_summary() from public, anon;
grant execute on function public.get_platform_subscription_summary() to authenticated;
