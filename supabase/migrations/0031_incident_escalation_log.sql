-- Phase 5: record a verified external handoff without claiming that KABALIKAT contacted responders.
alter table public.incident_events drop constraint incident_events_action_check;
alter table public.incident_events add constraint incident_events_action_check
  check (action in ('submitted','assigned','acknowledged','started','resolved','closed','response_update','evidence_attached','escalated'));

create or replace function public.escalate_incident(
  p_incident_id uuid,p_escalated_to text,p_note text,p_handoff_confirmed boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype;
begin
  select * into v_incident from public.incidents where id = p_incident_id for update;
  if not found or not public.has_tenant_permission(v_incident.barangay_id,'incident.manage') then raise exception 'not authorized'; end if;
  if v_incident.status not in ('submitted','acknowledged','in_progress') then raise exception 'only active incidents can be escalated'; end if;
  if length(trim(coalesce(p_escalated_to,''))) not between 3 and 180 or length(trim(coalesce(p_note,''))) not between 3 and 1000 then
    raise exception 'escalation destination and handoff details are required';
  end if;
  if p_handoff_confirmed is distinct from true then raise exception 'confirm that the external handoff has already occurred'; end if;
  insert into public.incident_events(incident_id,barangay_id,actor_id,action,note)
  values (v_incident.id,v_incident.barangay_id,auth.uid(),'escalated','Handoff to ' || trim(p_escalated_to) || ': ' || trim(p_note));
end;
$$;
revoke all on function public.escalate_incident(uuid,text,text,boolean) from public,anon;
grant execute on function public.escalate_incident(uuid,text,text,boolean) to authenticated;

create or replace function public.get_own_incident_status_events(p_barangay_id uuid)
returns table (incident_id uuid,action text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'incident.report') then raise exception 'not authorized'; end if;
  return query select e.incident_id,e.action,e.created_at
    from public.incident_events e join public.incidents i on i.id = e.incident_id and i.barangay_id = e.barangay_id
    where i.barangay_id = p_barangay_id and i.created_by = auth.uid()
      and e.action in ('submitted','acknowledged','started','resolved','closed','escalated')
    order by e.created_at;
end;
$$;
revoke all on function public.get_own_incident_status_events(uuid) from public,anon;
grant execute on function public.get_own_incident_status_events(uuid) to authenticated;
