-- Preserve the Captain's ability to track reports they sent to the LGU,
-- including when the municipality's current subscription has expired.
create or replace function public.get_captain_lgu_incident_follow_up_summary(p_barangay_id uuid)
returns table(awaiting_lgu_response bigint,being_handled_by_lgu bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'incident.manage')
    or not exists (
      select 1 from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'captain'
    ) then
    raise exception 'only the active Barangay Captain may view LGU incident follow-up';
  end if;

  return query
  select count(*) filter (where escalation.status = 'pending')::bigint,
    count(*) filter (where escalation.status = 'acknowledged')::bigint
  from public.lgu_incident_escalations escalation
  where escalation.barangay_id = p_barangay_id;
end;
$$;

revoke all on function public.get_captain_lgu_incident_follow_up_summary(uuid) from public,anon;
grant execute on function public.get_captain_lgu_incident_follow_up_summary(uuid) to authenticated;
