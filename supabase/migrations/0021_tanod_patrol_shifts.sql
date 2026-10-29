-- Phase 5: scheduled patrol shifts and manually entered shift logs.
insert into public.permissions(key,description) values
  ('patrol.manage','Schedule and manage barangay Tanod patrol shifts'),
  ('patrol.access','View and record assigned Tanod patrol shifts')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where (r.key = 'captain' and p.key = 'patrol.manage')
   or (r.key = 'tanod' and p.key = 'patrol.access')
on conflict do nothing;

create table public.patrol_shifts (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  patrol_area text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','active','completed','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,barangay_id),
  check (length(trim(title)) between 3 and 140),
  check (length(trim(patrol_area)) between 2 and 240),
  check (ends_at > starts_at and ends_at <= starts_at + interval '12 hours'),
  check ((status in ('active','completed')) = (started_at is not null)),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check (cancellation_note is null or length(cancellation_note) between 3 and 500)
);
create index patrol_shifts_tenant_schedule_idx on public.patrol_shifts(barangay_id,starts_at desc);
create index patrol_shifts_assignee_status_idx on public.patrol_shifts(assigned_to,status,starts_at desc);

create table public.patrol_shift_logs (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  shift_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  entry_type text not null check (entry_type in ('shift_started','checkpoint','observation','shift_completed','shift_cancelled')),
  location_note text not null default '',
  details text not null default '',
  created_at timestamptz not null default now(),
  foreign key (shift_id,barangay_id) references public.patrol_shifts(id,barangay_id) on delete restrict,
  check (length(location_note) <= 240),
  check (length(details) <= 1500)
);
create index patrol_shift_logs_history_idx on public.patrol_shift_logs(barangay_id,shift_id,created_at);

create or replace function public.get_patrol_assignees(p_barangay_id uuid)
returns table (user_id uuid,display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'patrol.manage') then raise exception 'not authorized'; end if;
  return query select m.user_id,coalesce(nullif(p.display_name,''),'Tanod')
    from public.barangay_memberships m join public.role_definitions r on r.id = m.role_id
    join public.profiles p on p.id = m.user_id
    where m.barangay_id = p_barangay_id and m.status = 'active' and r.key = 'tanod'
    order by p.display_name;
end;
$$;

create or replace function public.create_patrol_shift(
  p_barangay_id uuid,p_assigned_to uuid,p_title text,p_patrol_area text,p_starts_at timestamptz,p_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'patrol.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 140 or length(trim(coalesce(p_patrol_area,''))) not between 2 and 240
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '12 hours'
    or not exists (select 1 from public.barangay_memberships m join public.role_definitions r on r.id = m.role_id
      where m.barangay_id = p_barangay_id and m.user_id = p_assigned_to and m.status = 'active' and r.key = 'tanod') then
    raise exception 'invalid patrol shift details or assignee';
  end if;
  insert into public.patrol_shifts(barangay_id,assigned_to,title,patrol_area,starts_at,ends_at,created_by)
  values (p_barangay_id,p_assigned_to,trim(p_title),trim(p_patrol_area),p_starts_at,p_ends_at,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.start_patrol_shift(p_shift_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_shift public.patrol_shifts%rowtype;
begin
  select * into v_shift from public.patrol_shifts where id = p_shift_id for update;
  if not found or v_shift.assigned_to <> auth.uid() or not public.has_tenant_permission(v_shift.barangay_id,'patrol.access') then raise exception 'not authorized'; end if;
  if v_shift.status <> 'scheduled' then raise exception 'shift is not scheduled'; end if;
  update public.patrol_shifts set status = 'active',started_at = now(),updated_at = now() where id = v_shift.id;
  insert into public.patrol_shift_logs(barangay_id,shift_id,actor_id,entry_type)
    values (v_shift.barangay_id,v_shift.id,auth.uid(),'shift_started');
end;
$$;

create or replace function public.add_patrol_shift_log(p_shift_id uuid,p_entry_type text,p_location_note text,p_details text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_shift public.patrol_shifts%rowtype; v_id uuid;
begin
  select * into v_shift from public.patrol_shifts where id = p_shift_id for update;
  if not found or v_shift.assigned_to <> auth.uid() or not public.has_tenant_permission(v_shift.barangay_id,'patrol.access') then raise exception 'not authorized'; end if;
  if v_shift.status <> 'active' or p_entry_type not in ('checkpoint','observation')
    or length(coalesce(p_location_note,'')) > 240 or length(trim(coalesce(p_details,''))) not between 3 and 1500 then raise exception 'invalid patrol log entry'; end if;
  insert into public.patrol_shift_logs(barangay_id,shift_id,actor_id,entry_type,location_note,details)
    values (v_shift.barangay_id,v_shift.id,auth.uid(),p_entry_type,trim(coalesce(p_location_note,'')),trim(p_details)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.complete_patrol_shift(p_shift_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_shift public.patrol_shifts%rowtype;
begin
  select * into v_shift from public.patrol_shifts where id = p_shift_id for update;
  if not found or v_shift.assigned_to <> auth.uid() or not public.has_tenant_permission(v_shift.barangay_id,'patrol.access') then raise exception 'not authorized'; end if;
  if v_shift.status <> 'active' then raise exception 'only an active shift can be completed'; end if;
  update public.patrol_shifts set status = 'completed',completed_at = now(),updated_at = now() where id = v_shift.id;
  insert into public.patrol_shift_logs(barangay_id,shift_id,actor_id,entry_type)
    values (v_shift.barangay_id,v_shift.id,auth.uid(),'shift_completed');
end;
$$;

create or replace function public.cancel_patrol_shift(p_shift_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_shift public.patrol_shifts%rowtype;
begin
  select * into v_shift from public.patrol_shifts where id = p_shift_id for update;
  if not found or not public.has_tenant_permission(v_shift.barangay_id,'patrol.manage') then raise exception 'not authorized'; end if;
  if v_shift.status <> 'scheduled' or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'a reason is required; only scheduled shifts can be cancelled'; end if;
  update public.patrol_shifts set status = 'cancelled',cancelled_at = now(),cancellation_note = trim(p_reason),updated_at = now() where id = v_shift.id;
  insert into public.patrol_shift_logs(barangay_id,shift_id,actor_id,entry_type,details)
    values (v_shift.barangay_id,v_shift.id,auth.uid(),'shift_cancelled',trim(p_reason));
end;
$$;

alter table public.patrol_shifts enable row level security;
alter table public.patrol_shift_logs enable row level security;
create policy patrol_shifts_read on public.patrol_shifts for select to authenticated
  using (public.has_tenant_permission(barangay_id,'patrol.manage')
    or (assigned_to = (select auth.uid()) and public.has_tenant_permission(barangay_id,'patrol.access')));
create policy patrol_shift_logs_read on public.patrol_shift_logs for select to authenticated
  using (public.has_tenant_permission(barangay_id,'patrol.manage')
    or (exists (select 1 from public.patrol_shifts s where s.id = shift_id and s.assigned_to = (select auth.uid()))
      and public.has_tenant_permission(barangay_id,'patrol.access')));
revoke all on public.patrol_shifts,public.patrol_shift_logs from anon,authenticated;
grant select on public.patrol_shifts,public.patrol_shift_logs to authenticated;
revoke all on function public.get_patrol_assignees(uuid) from public,anon;
revoke all on function public.create_patrol_shift(uuid,uuid,text,text,timestamptz,timestamptz) from public,anon;
revoke all on function public.start_patrol_shift(uuid) from public,anon;
revoke all on function public.add_patrol_shift_log(uuid,text,text,text) from public,anon;
revoke all on function public.complete_patrol_shift(uuid) from public,anon;
revoke all on function public.cancel_patrol_shift(uuid,text) from public,anon;
grant execute on function public.get_patrol_assignees(uuid) to authenticated;
grant execute on function public.create_patrol_shift(uuid,uuid,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.start_patrol_shift(uuid) to authenticated;
grant execute on function public.add_patrol_shift_log(uuid,text,text,text) to authenticated;
grant execute on function public.complete_patrol_shift(uuid) to authenticated;
grant execute on function public.cancel_patrol_shift(uuid,text) to authenticated;
