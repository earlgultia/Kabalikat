-- Phase 5: tenant-scoped committees, member assignments, and tracked action items.
insert into public.permissions(key,description) values
  ('committee.manage','Create committees and assign their members')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where r.key in ('captain','secretary') and p.key = 'committee.manage'
on conflict do nothing;

create table public.committees (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  name text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id,barangay_id),
  unique (barangay_id,name),
  check (length(trim(name)) between 2 and 120),
  check (length(description) <= 1000)
);
create index committees_tenant_status_idx on public.committees(barangay_id,status,name);

create table public.committee_members (
  barangay_id uuid not null,
  committee_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (committee_id,user_id),
  foreign key (committee_id,barangay_id) references public.committees(id,barangay_id) on delete restrict,
  foreign key (barangay_id,user_id) references public.barangay_memberships(barangay_id,user_id) on delete restrict
);
create index committee_members_user_idx on public.committee_members(user_id,barangay_id);

create table public.committee_tasks (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  committee_id uuid not null,
  title text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open','in_progress','blocked','completed')),
  assigned_to uuid,
  due_date date,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (committee_id,barangay_id) references public.committees(id,barangay_id) on delete restrict,
  foreign key (committee_id,assigned_to) references public.committee_members(committee_id,user_id) on delete restrict,
  check (length(trim(title)) between 3 and 180),
  check (length(description) <= 2000)
);
create index committee_tasks_committee_status_idx on public.committee_tasks(committee_id,status,due_date);

create table public.committee_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  committee_id uuid not null,
  task_id uuid,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('committee_created','member_assigned','task_created','task_status_changed')),
  details text not null default '',
  created_at timestamptz not null default now(),
  foreign key (committee_id,barangay_id) references public.committees(id,barangay_id) on delete restrict,
  foreign key (task_id) references public.committee_tasks(id) on delete restrict,
  check (length(details) <= 2000)
);
create index committee_events_tenant_idx on public.committee_events(barangay_id,committee_id,created_at desc);

create or replace function public.is_committee_member(p_committee_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.committee_members cm
    join public.barangay_memberships bm on bm.barangay_id = cm.barangay_id and bm.user_id = cm.user_id
    where cm.committee_id = p_committee_id and cm.user_id = (select auth.uid()) and bm.status = 'active'
  );
$$;

create or replace function public.create_committee(p_barangay_id uuid,p_name text,p_description text default '')
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'committee.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120 or length(coalesce(p_description,'')) > 1000 then raise exception 'invalid committee details'; end if;
  insert into public.committees(barangay_id,name,description,created_by)
  values (p_barangay_id,trim(p_name),trim(coalesce(p_description,'')),auth.uid()) returning id into v_id;
  insert into public.committee_events(barangay_id,committee_id,actor_id,action,details)
  values (p_barangay_id,v_id,auth.uid(),'committee_created',trim(p_name));
  return v_id;
end;
$$;

create or replace function public.assign_committee_member(p_committee_id uuid,p_user_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_committee public.committees%rowtype;
begin
  select * into v_committee from public.committees where id = p_committee_id;
  if not found or not public.has_tenant_permission(v_committee.barangay_id,'committee.manage') then raise exception 'not authorized'; end if;
  if v_committee.status <> 'active' or not exists (select 1 from public.barangay_memberships m
    where m.barangay_id = v_committee.barangay_id and m.user_id = p_user_id and m.status = 'active') then
    raise exception 'committee and member must be active';
  end if;
  insert into public.committee_members(barangay_id,committee_id,user_id,assigned_by)
  values (v_committee.barangay_id,v_committee.id,p_user_id,auth.uid()) on conflict do nothing;
  if found then
    insert into public.committee_events(barangay_id,committee_id,actor_id,action,details)
    values (v_committee.barangay_id,v_committee.id,auth.uid(),'member_assigned',p_user_id::text);
  end if;
end;
$$;

create or replace function public.get_committee_assignable_members(p_barangay_id uuid)
returns table (user_id uuid,display_name text,role_label text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'committee.manage') then raise exception 'not authorized'; end if;
  return query select m.user_id,coalesce(nullif(p.display_name,''),'Barangay member'),r.label
    from public.barangay_memberships m
    join public.profiles p on p.id = m.user_id
    join public.role_definitions r on r.id = m.role_id
    where m.barangay_id = p_barangay_id and m.status = 'active'
    order by p.display_name,r.label;
end;
$$;

create or replace function public.create_committee_task(
  p_committee_id uuid,p_title text,p_description text default '',p_assigned_to uuid default null,p_due_date date default null
)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_committee public.committees%rowtype; v_id uuid; v_manager boolean;
begin
  select * into v_committee from public.committees where id = p_committee_id;
  if not found then raise exception 'committee not found'; end if;
  v_manager := public.has_tenant_permission(v_committee.barangay_id,'committee.manage');
  if not v_manager and not public.is_committee_member(v_committee.id) then raise exception 'not authorized'; end if;
  if v_committee.status <> 'active' or length(trim(coalesce(p_title,''))) not between 3 and 180
    or length(coalesce(p_description,'')) > 2000 then raise exception 'invalid action item'; end if;
  if not v_manager and p_assigned_to is not null and p_assigned_to <> auth.uid() then raise exception 'members may only assign their own action items'; end if;
  if p_assigned_to is not null and not exists (select 1 from public.committee_members cm
    where cm.committee_id = v_committee.id and cm.user_id = p_assigned_to) then raise exception 'assignee is not a committee member'; end if;
  insert into public.committee_tasks(barangay_id,committee_id,title,description,assigned_to,due_date,created_by,updated_by)
  values (v_committee.barangay_id,v_committee.id,trim(p_title),trim(coalesce(p_description,'')),p_assigned_to,p_due_date,auth.uid(),auth.uid())
  returning id into v_id;
  insert into public.committee_events(barangay_id,committee_id,task_id,actor_id,action,details)
  values (v_committee.barangay_id,v_committee.id,v_id,auth.uid(),'task_created',trim(p_title));
  return v_id;
end;
$$;

create or replace function public.update_committee_task_status(p_task_id uuid,p_status text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_task public.committee_tasks%rowtype; v_manager boolean;
begin
  select * into v_task from public.committee_tasks where id = p_task_id for update;
  if not found then raise exception 'action item not found'; end if;
  v_manager := public.has_tenant_permission(v_task.barangay_id,'committee.manage');
  if not v_manager and (not public.is_committee_member(v_task.committee_id) or v_task.assigned_to is distinct from auth.uid()) then
    raise exception 'only the assigned member or committee manager can update this action item';
  end if;
  if p_status not in ('open','in_progress','blocked','completed') then raise exception 'invalid action item status'; end if;
  if v_task.status = p_status then return; end if;
  update public.committee_tasks set status = p_status,updated_by = auth.uid(),updated_at = now() where id = p_task_id;
  insert into public.committee_events(barangay_id,committee_id,task_id,actor_id,action,details)
  values (v_task.barangay_id,v_task.committee_id,v_task.id,auth.uid(),'task_status_changed',v_task.status || ' -> ' || p_status);
end;
$$;

alter table public.committees enable row level security;
alter table public.committee_members enable row level security;
alter table public.committee_tasks enable row level security;
alter table public.committee_events enable row level security;
create policy committees_read on public.committees for select to authenticated
  using (public.has_tenant_permission(barangay_id,'committee.manage') or public.is_committee_member(id));
create policy committee_members_read on public.committee_members for select to authenticated
  using (public.has_tenant_permission(barangay_id,'committee.manage') or public.is_committee_member(committee_id));
create policy committee_tasks_read on public.committee_tasks for select to authenticated
  using (public.has_tenant_permission(barangay_id,'committee.manage') or public.is_committee_member(committee_id));
create policy committee_events_read on public.committee_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'committee.manage') or public.is_committee_member(committee_id));
create policy committee_member_profile_read on public.profiles for select to authenticated
  using (exists (select 1 from public.committee_members cm where cm.user_id = profiles.id
    and (public.has_tenant_permission(cm.barangay_id,'committee.manage') or public.is_committee_member(cm.committee_id))));

revoke all on public.committees,public.committee_members,public.committee_tasks,public.committee_events from anon,authenticated;
grant select on public.committees,public.committee_members,public.committee_tasks,public.committee_events to authenticated;
revoke all on function public.is_committee_member(uuid) from public,anon;
revoke all on function public.create_committee(uuid,text,text) from public,anon;
revoke all on function public.assign_committee_member(uuid,uuid) from public,anon;
revoke all on function public.get_committee_assignable_members(uuid) from public,anon;
revoke all on function public.create_committee_task(uuid,text,text,uuid,date) from public,anon;
revoke all on function public.update_committee_task_status(uuid,text) from public,anon;
grant execute on function public.is_committee_member(uuid) to authenticated;
grant execute on function public.create_committee(uuid,text,text) to authenticated;
grant execute on function public.assign_committee_member(uuid,uuid) to authenticated;
grant execute on function public.get_committee_assignable_members(uuid) to authenticated;
grant execute on function public.create_committee_task(uuid,text,text,uuid,date) to authenticated;
grant execute on function public.update_committee_task_status(uuid,text) to authenticated;
