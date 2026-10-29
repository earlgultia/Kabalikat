-- Phase 5: let residents submit and track only their own incident reports.
insert into public.permissions(key,description)
values ('incident.report','Submit and track own resident incident reports')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where r.key = 'resident' and p.key = 'incident.report'
on conflict do nothing;

create or replace function public.submit_incident(
  p_barangay_id uuid,p_category text,p_severity text,p_location text,p_summary text,p_details text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not (public.has_tenant_permission(p_barangay_id,'incident.create') or public.has_tenant_permission(p_barangay_id,'incident.report')) then
    raise exception 'not authorized';
  end if;
  if p_category not in ('safety','hazard','disturbance','property','disaster','other')
    or p_severity not in ('low','moderate','high','urgent')
    or length(trim(coalesce(p_location,''))) not between 2 and 240
    or length(trim(coalesce(p_summary,''))) not between 3 and 180
    or length(coalesce(p_details,'')) > 3000 then raise exception 'invalid incident report'; end if;
  insert into public.incidents(barangay_id,category,severity,location,summary,details,created_by)
  values (p_barangay_id,p_category,p_severity,trim(p_location),trim(p_summary),trim(coalesce(p_details,'')),auth.uid()) returning id into v_id;
  insert into public.incident_events(incident_id,barangay_id,actor_id,action,note)
  values (v_id,p_barangay_id,auth.uid(),'submitted',trim(p_summary));
  return v_id;
end;
$$;

drop policy incidents_read on public.incidents;
create policy incidents_read on public.incidents for select to authenticated
  using (public.has_tenant_permission(barangay_id,'incident.manage')
    or (created_by = (select auth.uid()) and (public.has_tenant_permission(barangay_id,'incident.create')
      or public.has_tenant_permission(barangay_id,'incident.report')))
    or (assigned_to = (select auth.uid()) and public.has_tenant_permission(barangay_id,'incident.create')));
drop policy incident_events_read on public.incident_events;
create policy incident_events_read on public.incident_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'incident.manage')
    or (exists (select 1 from public.incidents i where i.id = incident_id and i.created_by = (select auth.uid()))
      and public.has_tenant_permission(barangay_id,'incident.create')
      or exists (select 1 from public.incidents i where i.id = incident_id and i.assigned_to = (select auth.uid()))
      and public.has_tenant_permission(barangay_id,'incident.create')));

create or replace function public.get_own_incident_status_events(p_barangay_id uuid)
returns table (incident_id uuid,action text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'incident.report') then
    raise exception 'not authorized';
  end if;
  return query select e.incident_id,e.action,e.created_at
    from public.incident_events e join public.incidents i on i.id = e.incident_id and i.barangay_id = e.barangay_id
    where i.barangay_id = p_barangay_id and i.created_by = auth.uid() and e.action in ('submitted','acknowledged','started','resolved','closed')
    order by e.created_at;
end;
$$;
revoke all on function public.get_own_incident_status_events(uuid) from public,anon;
grant execute on function public.get_own_incident_status_events(uuid) to authenticated;
