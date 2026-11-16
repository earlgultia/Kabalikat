-- Small, tenant-scoped workload counters for the municipal incident view.
create or replace function public.get_lgu_municipal_incident_summary()
returns table (
  open_reports bigint,
  urgent_open_reports bigint,
  reported_today bigint,
  pending_escalations bigint
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

  perform public.require_active_lgu_subscription(v_lgu_id);

  return query
  select count(*) filter (where incident.status not in ('resolved','closed'))::bigint,
    count(*) filter (where incident.status not in ('resolved','closed')
      and incident.severity in ('urgent','high'))::bigint,
    count(*) filter (where incident.created_at >=
      (date_trunc('day',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'))::bigint,
    count(*) filter (where escalation.status = 'pending')::bigint
  from public.barangays barangay
  join public.incidents incident on incident.barangay_id = barangay.id
  left join public.lgu_incident_escalations escalation
    on escalation.incident_id = incident.id
    and escalation.barangay_id = incident.barangay_id
    and escalation.lgu_id = v_lgu_id
  where barangay.lgu_id = v_lgu_id;
end;
$$;

revoke all on function public.get_lgu_municipal_incident_summary() from public,anon;
grant execute on function public.get_lgu_municipal_incident_summary() to authenticated;
