-- Give the LGU a small tenant-scoped view of its response backlog.
create or replace function public.get_lgu_incident_response_workload()
returns table (
  pending_escalations bigint,
  acknowledged_escalations bigint,
  high_priority_pending bigint,
  oldest_pending_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id
  from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at,membership.id
  limit 1;

  if v_lgu_id is null then
    raise exception 'active LGU administrator access is required';
  end if;
  perform public.require_active_lgu_subscription(v_lgu_id);

  return query
  select count(*) filter (where escalation.status = 'pending')::bigint,
    count(*) filter (where escalation.status = 'acknowledged')::bigint,
    count(*) filter (where escalation.status = 'pending' and incident.severity in ('high','urgent'))::bigint,
    min(escalation.created_at) filter (where escalation.status = 'pending')
  from public.lgu_incident_escalations escalation
  join public.incidents incident
    on incident.id = escalation.incident_id and incident.barangay_id = escalation.barangay_id
  where escalation.lgu_id = v_lgu_id;
end;
$$;

revoke all on function public.get_lgu_incident_response_workload() from public,anon;
grant execute on function public.get_lgu_incident_response_workload() to authenticated;
