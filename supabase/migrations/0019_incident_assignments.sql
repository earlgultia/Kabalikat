-- Phase 5: assign response ownership to active Tanods and let assignees acknowledge.
alter table public.incidents add column assigned_to uuid references public.profiles(id) on delete restrict;
create index incidents_assignee_status_idx on public.incidents(assigned_to,status,created_at desc);
alter table public.incident_events drop constraint incident_events_action_check;
alter table public.incident_events add constraint incident_events_action_check
  check (action in ('submitted','assigned','acknowledged','started','resolved','closed'));

create or replace function public.get_incident_assignees(p_barangay_id uuid)
returns table (user_id uuid,display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'incident.manage') then raise exception 'not authorized'; end if;
  return query select m.user_id,coalesce(nullif(p.display_name,''),'Tanod')
    from public.barangay_memberships m
    join public.role_definitions r on r.id = m.role_id
    join public.profiles p on p.id = m.user_id
    where m.barangay_id = p_barangay_id and m.status = 'active' and r.key = 'tanod'
    order by p.display_name;
end;
$$;

create or replace function public.assign_incident(p_incident_id uuid,p_tanod_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_name text;
begin
  select * into v_incident from public.incidents where id = p_incident_id for update;
  if not found or not public.has_tenant_permission(v_incident.barangay_id,'incident.manage') then raise exception 'not authorized'; end if;
  if v_incident.status not in ('submitted','acknowledged','in_progress') then raise exception 'closed incidents cannot be assigned'; end if;
  select coalesce(nullif(p.display_name,''),'Tanod') into v_name
    from public.barangay_memberships m join public.role_definitions r on r.id = m.role_id
    join public.profiles p on p.id = m.user_id
    where m.barangay_id = v_incident.barangay_id and m.user_id = p_tanod_id and m.status = 'active' and r.key = 'tanod';
  if not found then raise exception 'assignee must be an active Tanod in this barangay'; end if;
  update public.incidents set assigned_to = p_tanod_id,managed_by = auth.uid(),updated_at = now() where id = v_incident.id;
  insert into public.incident_events(incident_id,barangay_id,actor_id,action,note)
    values (v_incident.id,v_incident.barangay_id,auth.uid(),'assigned',v_name);
end;
$$;

create or replace function public.transition_incident(p_incident_id uuid,p_status text,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_action text; v_manager boolean; v_assignee boolean;
begin
  select * into v_incident from public.incidents where id = p_incident_id for update;
  if not found then raise exception 'incident not found'; end if;
  v_manager := public.has_tenant_permission(v_incident.barangay_id,'incident.manage');
  v_assignee := coalesce(v_incident.assigned_to = auth.uid(),false) and public.has_tenant_permission(v_incident.barangay_id,'incident.create');
  if not v_manager and not v_assignee then raise exception 'not authorized'; end if;
  if not ((v_incident.status = 'submitted' and p_status = 'acknowledged')
    or (v_incident.status = 'acknowledged' and p_status = 'in_progress')
    or (v_incident.status = 'in_progress' and p_status = 'resolved' and v_manager)
    or (v_incident.status = 'resolved' and p_status = 'closed' and v_manager)) then raise exception 'invalid incident status transition'; end if;
  if p_status in ('acknowledged','in_progress') and not v_manager and not v_assignee then raise exception 'only the assigned Tanod can acknowledge or start this report'; end if;
  if p_status in ('resolved','closed') and length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'a resolution note is required'; end if;
  v_action := case p_status when 'acknowledged' then 'acknowledged' when 'in_progress' then 'started' when 'resolved' then 'resolved' else 'closed' end;
  update public.incidents set status = p_status, managed_by = case when v_manager then auth.uid() else managed_by end,
    resolution_note = case when p_status in ('resolved','closed') then trim(p_note) else null end, updated_at = now()
  where id = v_incident.id;
  insert into public.incident_events(incident_id,barangay_id,actor_id,action,note)
  values (v_incident.id,v_incident.barangay_id,auth.uid(),v_action,trim(coalesce(p_note,'')));
end;
$$;

drop policy incidents_read on public.incidents;
create policy incidents_read on public.incidents for select to authenticated
  using (public.has_tenant_permission(barangay_id,'incident.manage')
    or (created_by = (select auth.uid()) and public.has_tenant_permission(barangay_id,'incident.create'))
    or (assigned_to = (select auth.uid()) and public.has_tenant_permission(barangay_id,'incident.create')));
drop policy incident_events_read on public.incident_events;
create policy incident_events_read on public.incident_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'incident.manage')
    or (exists (select 1 from public.incidents i where i.id = incident_id and (i.created_by = (select auth.uid()) or i.assigned_to = (select auth.uid())))
      and public.has_tenant_permission(barangay_id,'incident.create')));

revoke all on function public.get_incident_assignees(uuid) from public,anon;
revoke all on function public.assign_incident(uuid,uuid) from public,anon;
grant execute on function public.get_incident_assignees(uuid) to authenticated;
grant execute on function public.assign_incident(uuid,uuid) to authenticated;
