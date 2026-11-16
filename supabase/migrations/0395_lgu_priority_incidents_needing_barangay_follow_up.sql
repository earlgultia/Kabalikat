-- Surface high and urgent open incidents that remain with their barangays.
-- This is a read-only coordination queue; it does not transfer ownership.
create or replace function public.list_lgu_priority_incidents_needing_barangay_follow_up(
  p_limit integer default 10
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_lgu_id uuid;
  v_rows jsonb;
  v_total bigint;
begin
  select membership.lgu_id into v_lgu_id
  from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at, membership.id limit 1;

  perform public.require_active_lgu_subscription(v_lgu_id);
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'limit must be between 1 and 25';
  end if;

  select count(*) into v_total
  from public.barangays barangay
  join public.incidents incident on incident.barangay_id = barangay.id
  where barangay.lgu_id = v_lgu_id
    and incident.severity in ('high', 'urgent')
    and incident.status in ('submitted', 'acknowledged', 'in_progress')
    and not exists (
      select 1 from public.lgu_incident_escalations escalation
      where escalation.incident_id = incident.id
        and escalation.barangay_id = incident.barangay_id
        and escalation.lgu_id = v_lgu_id
    );

  select coalesce(jsonb_agg(to_jsonb(report_row) order by report_row.created_at desc, report_row.id desc), '[]'::jsonb)
  into v_rows
  from (
    select incident.id, incident.barangay_id, barangay.name as barangay_name,
      incident.category, incident.severity, incident.location, incident.summary,
      incident.details, incident.status, incident.created_at
    from public.barangays barangay
    join public.incidents incident on incident.barangay_id = barangay.id
    where barangay.lgu_id = v_lgu_id
      and incident.severity in ('high', 'urgent')
      and incident.status in ('submitted', 'acknowledged', 'in_progress')
      and not exists (
        select 1 from public.lgu_incident_escalations escalation
        where escalation.incident_id = incident.id
          and escalation.barangay_id = incident.barangay_id
          and escalation.lgu_id = v_lgu_id
      )
    order by incident.created_at desc, incident.id desc
    limit p_limit
  ) report_row;

  return jsonb_build_object('total_count', v_total, 'rows', v_rows);
end;
$$;

revoke all on function public.list_lgu_priority_incidents_needing_barangay_follow_up(integer) from public, anon;
grant execute on function public.list_lgu_priority_incidents_needing_barangay_follow_up(integer) to authenticated;
