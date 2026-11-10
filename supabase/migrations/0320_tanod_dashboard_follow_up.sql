-- Give Tanods private counts for their assigned safety work.
create index if not exists incidents_assignee_follow_up_idx
  on public.incidents (barangay_id, assigned_to, status, created_at desc);

create or replace function public.get_tanod_dashboard_follow_up(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assigned_incidents bigint := 0;
  v_scheduled_patrols bigint := 0;
  v_active_patrols bigint := 0;
begin
  if not public.is_active_member(p_barangay_id)
    or not public.tenant_plan_feature_enabled(p_barangay_id, 'public_safety')
    or not (
      public.has_tenant_permission(p_barangay_id, 'incident.create')
      or public.has_tenant_permission(p_barangay_id, 'patrol.access')
    ) then
    raise exception 'not authorized';
  end if;

  if public.has_tenant_permission(p_barangay_id, 'incident.create') then
    select count(*) into v_assigned_incidents
    from public.incidents incident
    where incident.barangay_id = p_barangay_id
      and incident.assigned_to = (select auth.uid())
      and incident.status in ('submitted', 'acknowledged', 'in_progress');
  end if;

  if public.has_tenant_permission(p_barangay_id, 'patrol.access') then
    select count(*) into v_scheduled_patrols
    from public.patrol_shifts shift
    where shift.barangay_id = p_barangay_id
      and shift.assigned_to = (select auth.uid())
      and shift.status = 'scheduled'
      and shift.starts_at >= now();

    select count(*) into v_active_patrols
    from public.patrol_shifts shift
    where shift.barangay_id = p_barangay_id
      and shift.assigned_to = (select auth.uid())
      and shift.status = 'active';
  end if;

  return jsonb_build_object(
    'assigned_open_incidents', v_assigned_incidents,
    'upcoming_patrol_shifts', v_scheduled_patrols,
    'active_patrol_shifts', v_active_patrols,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_tanod_dashboard_follow_up(uuid) from public, anon;
grant execute on function public.get_tanod_dashboard_follow_up(uuid) to authenticated;
