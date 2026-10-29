-- Phase 5: append-only response notes visible to the incident's authorized team.
alter table public.incident_events drop constraint incident_events_action_check;
alter table public.incident_events add constraint incident_events_action_check
  check (action in ('submitted','assigned','acknowledged','started','resolved','closed','response_update'));

create or replace function public.add_incident_update(p_incident_id uuid,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_manager boolean; v_assignee boolean;
begin
  select * into v_incident from public.incidents where id = p_incident_id for update;
  if not found then raise exception 'incident not found'; end if;
  v_manager := public.has_tenant_permission(v_incident.barangay_id,'incident.manage');
  v_assignee := coalesce(v_incident.assigned_to = auth.uid(),false) and public.has_tenant_permission(v_incident.barangay_id,'incident.create');
  if not v_manager and not v_assignee then raise exception 'not authorized'; end if;
  if v_incident.status not in ('acknowledged','in_progress') then raise exception 'response updates are only allowed for active incidents'; end if;
  if length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'response update must be 3 to 1000 characters'; end if;
  insert into public.incident_events(incident_id,barangay_id,actor_id,action,note)
    values (v_incident.id,v_incident.barangay_id,auth.uid(),'response_update',trim(p_note));
end;
$$;
revoke all on function public.add_incident_update(uuid,text) from public,anon;
grant execute on function public.add_incident_update(uuid,text) to authenticated;
