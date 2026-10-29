-- Public-facing emergency contacts and evacuation locations, managed by
-- authorized barangay officials and audited through explicit RPCs.
create table public.disaster_emergency_resources (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  resource_type text not null check (resource_type in ('emergency_contact','evacuation_center')),
  name text not null,
  phone text,
  address text,
  details text not null default '',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_by uuid references public.profiles(id) on delete restrict,
  archived_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,barangay_id),
  check(length(trim(name)) between 2 and 120),
  check(phone is null or length(trim(phone)) between 5 and 40),
  check(phone is null or (phone ~ '^[0-9+(). #xX-]{5,40}$' and phone ~ '[0-9]')),
  check(address is null or length(trim(address)) between 3 and 250),
  check(length(trim(details)) <= 1000),
  check(resource_type <> 'emergency_contact' or phone is not null),
  check(resource_type <> 'evacuation_center' or address is not null),
  check((published_at is null) = (published_by is null)),
  check(status <> 'published' or published_at is not null),
  check(status <> 'draft' or published_at is null),
  check((status = 'archived') = (archived_at is not null and archived_by is not null))
);
create index disaster_emergency_resources_read_idx
  on public.disaster_emergency_resources(barangay_id,status,resource_type,name);

create table public.disaster_emergency_resource_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  resource_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('created','updated','published','archived')),
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key(resource_id,barangay_id) references public.disaster_emergency_resources(id,barangay_id) on delete restrict,
  check(length(note) <= 1000)
);
create index disaster_emergency_resource_events_idx
  on public.disaster_emergency_resource_events(barangay_id,resource_id,created_at desc);

alter table public.disaster_emergency_resources enable row level security;
alter table public.disaster_emergency_resource_events enable row level security;
create policy disaster_emergency_resources_read on public.disaster_emergency_resources
  for select to authenticated using (
    public.has_tenant_permission(barangay_id,'disaster.manage')
    or (status = 'published' and public.has_tenant_permission(barangay_id,'disaster.read'))
  );
create policy disaster_emergency_resource_events_read on public.disaster_emergency_resource_events
  for select to authenticated using (public.has_tenant_permission(barangay_id,'disaster.manage'));
revoke all on public.disaster_emergency_resources,public.disaster_emergency_resource_events from anon,authenticated;
grant select(id,barangay_id,resource_type,name,phone,address,details,status,published_at,created_at,updated_at)
  on public.disaster_emergency_resources to authenticated;
grant select(id,barangay_id,resource_id,action,note,created_at)
  on public.disaster_emergency_resource_events to authenticated;

create or replace function public.save_disaster_emergency_resource(
  p_barangay_id uuid,p_resource_id uuid,p_resource_type text,p_name text,p_phone text,p_address text,p_details text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_resource public.disaster_emergency_resources%rowtype; v_id uuid;
        v_phone text := nullif(trim(coalesce(p_phone,'')),'');
        v_address text := nullif(trim(coalesce(p_address,'')),'');
        v_details text := trim(coalesce(p_details,''));
begin
  if not public.has_tenant_permission(p_barangay_id,'disaster.manage') then raise exception 'not authorized'; end if;
  if p_resource_type is null or p_resource_type not in ('emergency_contact','evacuation_center')
    or length(trim(coalesce(p_name,''))) not between 2 and 120
    or v_phone is not null and (
      length(v_phone) not between 5 and 40
      or v_phone !~ '^[0-9+(). #xX-]{5,40}$'
      or v_phone !~ '[0-9]'
    )
    or v_address is not null and length(v_address) not between 3 and 250
    or length(v_details) > 1000
    or p_resource_type = 'emergency_contact' and v_phone is null
    or p_resource_type = 'evacuation_center' and v_address is null then
    raise exception 'provide a valid name, phone number for contacts, and address for evacuation centers';
  end if;
  if p_resource_id is null then
    insert into public.disaster_emergency_resources(barangay_id,resource_type,name,phone,address,details,created_by)
      values(p_barangay_id,p_resource_type,trim(p_name),v_phone,v_address,v_details,auth.uid()) returning id into v_id;
    insert into public.disaster_emergency_resource_events(barangay_id,resource_id,actor_id,action,note)
      values(p_barangay_id,v_id,auth.uid(),'created',trim(p_name));
    return v_id;
  end if;
  select * into v_resource from public.disaster_emergency_resources
    where id = p_resource_id and barangay_id = p_barangay_id for update;
  if not found or v_resource.status <> 'draft' then raise exception 'only a draft resource can be edited'; end if;
  update public.disaster_emergency_resources set resource_type=p_resource_type,name=trim(p_name),phone=v_phone,
    address=v_address,details=v_details,updated_at=now() where id=v_resource.id;
  insert into public.disaster_emergency_resource_events(barangay_id,resource_id,actor_id,action,note)
    values(p_barangay_id,v_resource.id,auth.uid(),'updated',trim(p_name));
  return v_resource.id;
end;
$$;

create or replace function public.publish_disaster_emergency_resource(p_resource_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_resource public.disaster_emergency_resources%rowtype;
begin
  select * into v_resource from public.disaster_emergency_resources where id=p_resource_id for update;
  if not found or not public.has_tenant_permission(v_resource.barangay_id,'disaster.manage') then raise exception 'not authorized'; end if;
  if v_resource.status <> 'draft' then raise exception 'only a draft resource can be published'; end if;
  update public.disaster_emergency_resources set status='published',published_by=auth.uid(),published_at=now(),updated_at=now()
    where id=v_resource.id;
  insert into public.disaster_emergency_resource_events(barangay_id,resource_id,actor_id,action,note)
    values(v_resource.barangay_id,v_resource.id,auth.uid(),'published',v_resource.name);
end;
$$;

create or replace function public.archive_disaster_emergency_resource(p_resource_id uuid,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_resource public.disaster_emergency_resources%rowtype; v_note text := trim(coalesce(p_note,''));
begin
  select * into v_resource from public.disaster_emergency_resources where id=p_resource_id for update;
  if not found or not public.has_tenant_permission(v_resource.barangay_id,'disaster.manage') then raise exception 'not authorized'; end if;
  if v_resource.status = 'archived' then raise exception 'resource is already archived'; end if;
  if length(v_note) > 1000 then raise exception 'archive note cannot exceed 1000 characters'; end if;
  update public.disaster_emergency_resources set status='archived',archived_by=auth.uid(),archived_at=now(),updated_at=now()
    where id=v_resource.id;
  insert into public.disaster_emergency_resource_events(barangay_id,resource_id,actor_id,action,note)
    values(v_resource.barangay_id,v_resource.id,auth.uid(),'archived',v_note);
end;
$$;

create or replace function public.list_disaster_emergency_resource_activity(p_barangay_id uuid)
returns table(resource_id uuid,resource_name text,action text,actor_name text,note text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'disaster.manage') then raise exception 'not authorized'; end if;
  return query select e.resource_id,r.name,e.action,coalesce(nullif(p.display_name,''),'Workspace member'),e.note,e.created_at
    from public.disaster_emergency_resource_events e
    join public.disaster_emergency_resources r on r.id=e.resource_id and r.barangay_id=e.barangay_id
    left join public.profiles p on p.id=e.actor_id
    where e.barangay_id=p_barangay_id order by e.created_at desc,e.id desc;
end;
$$;

revoke all on function public.save_disaster_emergency_resource(uuid,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.publish_disaster_emergency_resource(uuid) from public,anon;
revoke all on function public.archive_disaster_emergency_resource(uuid,text) from public,anon;
revoke all on function public.list_disaster_emergency_resource_activity(uuid) from public,anon;
grant execute on function public.save_disaster_emergency_resource(uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.publish_disaster_emergency_resource(uuid) to authenticated;
grant execute on function public.archive_disaster_emergency_resource(uuid,text) to authenticated;
grant execute on function public.list_disaster_emergency_resource_activity(uuid) to authenticated;
