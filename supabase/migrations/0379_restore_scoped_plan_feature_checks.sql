-- RLS policies call this SECURITY DEFINER helper directly. Restore the
-- authenticated grant and keep its result scoped to the caller's own active
-- barangay membership and to the four supported feature switches.
create or replace function public.tenant_plan_feature_enabled(
  p_barangay_id uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      (
        subscription.status = 'trial'
        and coalesce(subscription.grace_ends_at,subscription.trial_ends_at) > now()
      )
      or (
        subscription.status = 'active'
        and subscription.billing_period_ends_at is not null
        and subscription.billing_period_ends_at > now()
      )
      or (subscription.status = 'past_due' and subscription.grace_ends_at > now())
    )
    and (
      not (coalesce(plan.entitlements,'{}'::jsonb) ?| array[
        'core_services', 'finance', 'community_programs', 'public_safety'
      ])
      or coalesce((plan.entitlements ->> p_feature)::boolean,false)
    ),
    false
  )
  from public.subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id
  where subscription.barangay_id = p_barangay_id
    and p_feature in ('core_services','finance','community_programs','public_safety')
    and public.is_active_member(p_barangay_id);
$$;

revoke all on function public.tenant_plan_feature_enabled(uuid,text) from public,anon;
grant execute on function public.tenant_plan_feature_enabled(uuid,text) to authenticated;
