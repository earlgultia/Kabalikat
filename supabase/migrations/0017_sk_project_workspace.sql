-- Phase 5: SK proposals and project progress, separated from the finance ledger.
insert into public.permissions(key,description) values
  ('sk.manage','Submit and manage SK projects and progress reports'),
  ('sk.review','Review SK project proposals')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where (r.key = 'sk_chairperson' and p.key = 'sk.manage')
   or (r.key = 'captain' and p.key = 'sk.review')
on conflict do nothing;

create table public.sk_projects (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  title text not null,
  description text not null,
  proposed_budget numeric(14,2) not null default 0 check (proposed_budget >= 0),
  planned_start date,
  planned_end date,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected','active','completed')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,barangay_id),
  check (length(trim(title)) between 3 and 180),
  check (length(trim(description)) between 3 and 4000),
  check (planned_start is null or planned_end is null or planned_end >= planned_start),
  check ((status = 'submitted') = (reviewed_by is null)),
  check ((status = 'submitted') = (reviewed_at is null)),
  check ((status = 'rejected') = (review_note is not null)),
  check (review_note is null or length(review_note) <= 1000)
);
create index sk_projects_tenant_status_idx on public.sk_projects(barangay_id,status,created_at desc);

create table public.sk_project_updates (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  project_id uuid not null,
  update_type text not null check (update_type in ('milestone','progress')),
  title text not null,
  details text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (project_id,barangay_id) references public.sk_projects(id,barangay_id) on delete restrict,
  check (length(trim(title)) between 3 and 180),
  check (length(details) <= 3000)
);
create index sk_project_updates_project_idx on public.sk_project_updates(project_id,created_at desc);

create table public.sk_project_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  project_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('project_submitted','project_approved','project_rejected','project_activated','project_completed','project_update_added')),
  details text not null default '',
  created_at timestamptz not null default now(),
  foreign key (project_id,barangay_id) references public.sk_projects(id,barangay_id) on delete restrict,
  check (length(details) <= 3000)
);
create index sk_project_events_tenant_idx on public.sk_project_events(barangay_id,project_id,created_at desc);

create or replace function public.submit_sk_project(
  p_barangay_id uuid,p_title text,p_description text,p_proposed_budget numeric default 0,p_planned_start date default null,p_planned_end date default null
)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'sk.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 180 or length(trim(coalesce(p_description,''))) not between 3 and 4000
    or p_proposed_budget is null or p_proposed_budget < 0 or p_proposed_budget <> round(p_proposed_budget,2)
    or p_proposed_budget > 999999999999.99 or p_planned_start is not null and p_planned_end is not null and p_planned_end < p_planned_start then
    raise exception 'invalid SK project proposal';
  end if;
  insert into public.sk_projects(barangay_id,title,description,proposed_budget,planned_start,planned_end,created_by)
  values (p_barangay_id,trim(p_title),trim(p_description),p_proposed_budget,p_planned_start,p_planned_end,auth.uid()) returning id into v_id;
  insert into public.sk_project_events(barangay_id,project_id,actor_id,action,details)
  values (p_barangay_id,v_id,auth.uid(),'project_submitted',trim(p_title));
  return v_id;
end;
$$;

create or replace function public.review_sk_project(p_project_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_project public.sk_projects%rowtype;
begin
  select * into v_project from public.sk_projects where id = p_project_id for update;
  if not found or not public.has_tenant_permission(v_project.barangay_id,'sk.review') then raise exception 'not authorized'; end if;
  if v_project.status <> 'submitted' then raise exception 'proposal is no longer awaiting review'; end if;
  if v_project.created_by = auth.uid() then raise exception 'proposal creator cannot review it'; end if;
  if not p_approve and length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'a reason is required to reject a proposal'; end if;
  update public.sk_projects set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(),reviewed_at = now(),review_note = case when p_approve then null else trim(p_note) end,updated_at = now()
    where id = v_project.id;
  insert into public.sk_project_events(barangay_id,project_id,actor_id,action,details)
  values (v_project.barangay_id,v_project.id,auth.uid(),case when p_approve then 'project_approved' else 'project_rejected' end,
    case when p_approve then '' else trim(p_note) end);
end;
$$;

create or replace function public.update_sk_project_status(p_project_id uuid,p_status text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_project public.sk_projects%rowtype;
begin
  select * into v_project from public.sk_projects where id = p_project_id for update;
  if not found or not public.has_tenant_permission(v_project.barangay_id,'sk.manage') then raise exception 'not authorized'; end if;
  if not ((v_project.status = 'approved' and p_status = 'active') or (v_project.status = 'active' and p_status = 'completed')) then
    raise exception 'invalid SK project status transition';
  end if;
  update public.sk_projects set status = p_status,updated_at = now() where id = v_project.id;
  insert into public.sk_project_events(barangay_id,project_id,actor_id,action)
  values (v_project.barangay_id,v_project.id,auth.uid(),case when p_status = 'active' then 'project_activated' else 'project_completed' end);
end;
$$;

create or replace function public.add_sk_project_update(p_project_id uuid,p_update_type text,p_title text,p_details text default '')
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_project public.sk_projects%rowtype; v_id uuid;
begin
  select * into v_project from public.sk_projects where id = p_project_id;
  if not found or not public.has_tenant_permission(v_project.barangay_id,'sk.manage') then raise exception 'not authorized'; end if;
  if v_project.status not in ('approved','active') or p_update_type not in ('milestone','progress')
    or length(trim(coalesce(p_title,''))) not between 3 and 180 or length(coalesce(p_details,'')) > 3000 then
    raise exception 'invalid project update';
  end if;
  insert into public.sk_project_updates(barangay_id,project_id,update_type,title,details,created_by)
  values (v_project.barangay_id,v_project.id,p_update_type,trim(p_title),trim(coalesce(p_details,'')),auth.uid()) returning id into v_id;
  insert into public.sk_project_events(barangay_id,project_id,actor_id,action,details)
  values (v_project.barangay_id,v_project.id,auth.uid(),'project_update_added',trim(p_title));
  return v_id;
end;
$$;

alter table public.sk_projects enable row level security;
alter table public.sk_project_updates enable row level security;
alter table public.sk_project_events enable row level security;
create policy sk_projects_read on public.sk_projects for select to authenticated
  using (public.has_tenant_permission(barangay_id,'sk.manage') or public.has_tenant_permission(barangay_id,'sk.review'));
create policy sk_project_updates_read on public.sk_project_updates for select to authenticated
  using (public.has_tenant_permission(barangay_id,'sk.manage') or public.has_tenant_permission(barangay_id,'sk.review'));
create policy sk_project_events_read on public.sk_project_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'sk.manage') or public.has_tenant_permission(barangay_id,'sk.review'));
revoke all on public.sk_projects,public.sk_project_updates,public.sk_project_events from anon,authenticated;
grant select on public.sk_projects,public.sk_project_updates,public.sk_project_events to authenticated;
revoke all on function public.submit_sk_project(uuid,text,text,numeric,date,date) from public,anon;
revoke all on function public.review_sk_project(uuid,boolean,text) from public,anon;
revoke all on function public.update_sk_project_status(uuid,text) from public,anon;
revoke all on function public.add_sk_project_update(uuid,text,text,text) from public,anon;
grant execute on function public.submit_sk_project(uuid,text,text,numeric,date,date) to authenticated;
grant execute on function public.review_sk_project(uuid,boolean,text) to authenticated;
grant execute on function public.update_sk_project_status(uuid,text) to authenticated;
grant execute on function public.add_sk_project_update(uuid,text,text,text) to authenticated;
