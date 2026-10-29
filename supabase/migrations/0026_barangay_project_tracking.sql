-- Phase 7: general barangay project tracking, separate from SK proposals and finance.
insert into public.permissions(key,description) values
  ('project.manage','Create barangay projects and record progress')
on conflict (key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where r.key in ('captain','secretary','kagawad') and p.key = 'project.manage'
on conflict do nothing;

create table public.barangay_projects (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  title text not null,
  description text not null default '',
  planned_start date,
  planned_end date,
  status text not null default 'planned' check (status in ('planned','active','paused','completed','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,barangay_id),
  check (length(trim(title)) between 3 and 180),
  check (length(description) <= 4000),
  check (planned_start is null or planned_end is null or planned_end >= planned_start)
);
create index barangay_projects_tenant_status_idx on public.barangay_projects(barangay_id,status,created_at desc);

create table public.barangay_project_updates (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  project_id uuid not null,
  update_type text not null check (update_type in ('milestone','progress')),
  title text not null,
  details text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (project_id,barangay_id) references public.barangay_projects(id,barangay_id) on delete restrict,
  check (length(trim(title)) between 3 and 180),
  check (length(details) <= 3000)
);
create index barangay_project_updates_project_idx on public.barangay_project_updates(project_id,created_at desc);

create table public.barangay_project_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  project_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('project_created','status_changed','update_added')),
  details text not null default '',
  created_at timestamptz not null default now(),
  foreign key (project_id,barangay_id) references public.barangay_projects(id,barangay_id) on delete restrict,
  check (length(details) <= 3000)
);
create index barangay_project_events_project_idx on public.barangay_project_events(barangay_id,project_id,created_at desc);

create or replace function public.create_barangay_project(
  p_barangay_id uuid,p_title text,p_description text default '',p_planned_start date default null,p_planned_end date default null
)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'project.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 180 or length(coalesce(p_description,'')) > 4000
    or p_planned_start is not null and p_planned_end is not null and p_planned_end < p_planned_start then
    raise exception 'invalid project details';
  end if;
  insert into public.barangay_projects(barangay_id,title,description,planned_start,planned_end,created_by)
  values (p_barangay_id,trim(p_title),trim(coalesce(p_description,'')),p_planned_start,p_planned_end,auth.uid()) returning id into v_id;
  insert into public.barangay_project_events(barangay_id,project_id,actor_id,action,details)
  values (p_barangay_id,v_id,auth.uid(),'project_created',trim(p_title));
  return v_id;
end;
$$;

create or replace function public.update_barangay_project_status(p_project_id uuid,p_status text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_project public.barangay_projects%rowtype;
begin
  select * into v_project from public.barangay_projects where id = p_project_id for update;
  if not found or not public.has_tenant_permission(v_project.barangay_id,'project.manage') then raise exception 'not authorized'; end if;
  if not ((v_project.status = 'planned' and p_status in ('active','cancelled'))
    or (v_project.status = 'active' and p_status in ('paused','completed','cancelled'))
    or (v_project.status = 'paused' and p_status in ('active','cancelled'))) then
    raise exception 'invalid project status transition';
  end if;
  update public.barangay_projects set status = p_status,updated_at = now() where id = v_project.id;
  insert into public.barangay_project_events(barangay_id,project_id,actor_id,action,details)
  values (v_project.barangay_id,v_project.id,auth.uid(),'status_changed',v_project.status || ' → ' || p_status);
end;
$$;

create or replace function public.add_barangay_project_update(p_project_id uuid,p_update_type text,p_title text,p_details text default '')
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_project public.barangay_projects%rowtype; v_id uuid;
begin
  select * into v_project from public.barangay_projects where id = p_project_id;
  if not found or not public.has_tenant_permission(v_project.barangay_id,'project.manage') then raise exception 'not authorized'; end if;
  if v_project.status not in ('active','paused') or p_update_type not in ('milestone','progress')
    or length(trim(coalesce(p_title,''))) not between 3 and 180 or length(coalesce(p_details,'')) > 3000 then
    raise exception 'invalid project update';
  end if;
  insert into public.barangay_project_updates(barangay_id,project_id,update_type,title,details,created_by)
  values (v_project.barangay_id,v_project.id,p_update_type,trim(p_title),trim(coalesce(p_details,'')),auth.uid()) returning id into v_id;
  insert into public.barangay_project_events(barangay_id,project_id,actor_id,action,details)
  values (v_project.barangay_id,v_project.id,auth.uid(),'update_added',trim(p_title));
  return v_id;
end;
$$;

alter table public.barangay_projects enable row level security;
alter table public.barangay_project_updates enable row level security;
alter table public.barangay_project_events enable row level security;
create policy barangay_projects_read on public.barangay_projects for select to authenticated
  using (public.is_active_member(barangay_id));
create policy barangay_project_updates_read on public.barangay_project_updates for select to authenticated
  using (public.is_active_member(barangay_id));
create policy barangay_project_events_read on public.barangay_project_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'project.manage'));
revoke all on public.barangay_projects,public.barangay_project_updates,public.barangay_project_events from anon,authenticated;
grant select on public.barangay_projects,public.barangay_project_updates,public.barangay_project_events to authenticated;
revoke all on function public.create_barangay_project(uuid,text,text,date,date) from public,anon;
revoke all on function public.update_barangay_project_status(uuid,text) from public,anon;
revoke all on function public.add_barangay_project_update(uuid,text,text,text) from public,anon;
grant execute on function public.create_barangay_project(uuid,text,text,date,date) to authenticated;
grant execute on function public.update_barangay_project_status(uuid,text) to authenticated;
grant execute on function public.add_barangay_project_update(uuid,text,text,text) to authenticated;
