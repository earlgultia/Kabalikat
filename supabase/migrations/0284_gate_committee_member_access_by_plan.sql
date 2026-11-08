-- Committee member table policies and member task RPCs share this helper.
-- Apply the same community-programs subscription gate used by
-- committee.manage permissions to ordinary committee membership access.
create or replace function public.is_committee_member(p_committee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_members committee_member
    join public.barangay_memberships membership
      on membership.barangay_id = committee_member.barangay_id
     and membership.user_id = committee_member.user_id
    where committee_member.committee_id = p_committee_id
      and committee_member.user_id = (select auth.uid())
      and membership.status = 'active'
      and public.tenant_plan_feature_enabled(
        committee_member.barangay_id,
        'community_programs'
      )
  );
$$;

revoke all on function public.is_committee_member(uuid) from public, anon;
grant execute on function public.is_committee_member(uuid) to authenticated;
