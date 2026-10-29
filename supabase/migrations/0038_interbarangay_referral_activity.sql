-- Expose referral audit activity only to authorized staff from either involved barangay.
create or replace function public.list_interbarangay_referral_activity()
returns table (referral_id uuid, action text, actor_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.barangay_memberships m
    where m.user_id = auth.uid() and m.status = 'active') then raise exception 'not authorized'; end if;
  return query
    select e.referral_id, e.action, coalesce(nullif(p.display_name, ''), 'Barangay member'), e.created_at
    from public.interbarangay_referral_events e
    join public.interbarangay_referrals r on r.id = e.referral_id
    join public.profiles p on p.id = e.actor_id
    where public.has_tenant_permission(r.origin_barangay_id, 'referrals.create')
       or public.has_tenant_permission(r.receiving_barangay_id, 'referrals.review')
    order by e.created_at desc limit 500;
end;
$$;
revoke all on function public.list_interbarangay_referral_activity() from public, anon;
grant execute on function public.list_interbarangay_referral_activity() to authenticated;
