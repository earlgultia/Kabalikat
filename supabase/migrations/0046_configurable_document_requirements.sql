-- Let Captains and Secretaries publish a practical checklist for each document type.
alter table public.document_types
  add column requirements text[] not null default '{}'::text[];

insert into public.permissions(key,description)
  values ('document.type.manage','Configure document types and applicant requirements')
  on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where r.key in ('captain','secretary') and p.key = 'document.type.manage'
on conflict do nothing;

drop policy document_types_read on public.document_types;
create policy document_types_read on public.document_types for select to authenticated
  using (public.has_tenant_permission(barangay_id,'document.request.review')
    or public.has_tenant_permission(barangay_id,'document.type.manage')
    or (public.is_active_member(barangay_id) and public_request_enabled));
revoke insert,update,delete on public.document_types from anon,authenticated;

create table public.document_type_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  document_type_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('created','updated')),
  previous_values jsonb,
  new_values jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (document_type_id,barangay_id) references public.document_types(id,barangay_id) on delete restrict
);
create index document_type_events_history_idx on public.document_type_events(document_type_id,created_at desc);
alter table public.document_type_events enable row level security;
revoke all on public.document_type_events from anon,authenticated;

create or replace function public.normalize_document_requirements(p_requirements text[])
returns text[] language plpgsql immutable set search_path = '' as $$
declare v_item text; v_result text[] := '{}'::text[];
begin
  if coalesce(cardinality(p_requirements),0) > 12 then raise exception 'enter no more than 12 requirements'; end if;
  foreach v_item in array coalesce(p_requirements,'{}'::text[]) loop
    if v_item is null or length(trim(v_item)) not between 1 and 200 then
      raise exception 'each requirement must be between 1 and 200 characters';
    end if;
    if exists (select 1 from unnest(v_result) item where lower(item) = lower(trim(v_item))) then
      raise exception 'requirements cannot contain duplicates';
    end if;
    v_result := array_append(v_result,trim(v_item));
  end loop;
  return v_result;
end;
$$;
revoke all on function public.normalize_document_requirements(text[]) from public,anon;
grant execute on function public.normalize_document_requirements(text[]) to authenticated;

create or replace function public.create_document_type(
  p_barangay_id uuid,p_code text,p_name text,p_description text default '',
  p_requirements text[] default '{}'::text[],p_public_request_enabled boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_type_id uuid; v_requirements text[];
begin
  if not public.has_tenant_permission(p_barangay_id,'document.type.manage') then raise exception 'not authorized'; end if;
  if coalesce(p_code,'') !~ '^[A-Z][A-Z0-9_]{1,39}$' then raise exception 'code must use 2-40 uppercase letters, numbers, or underscores'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'name must be between 2 and 120 characters'; end if;
  if length(coalesce(p_description,'')) > 500 then raise exception 'description cannot exceed 500 characters'; end if;
  v_requirements := public.normalize_document_requirements(p_requirements);
  insert into public.document_types(barangay_id,code,name,description,requirements,public_request_enabled)
    values (p_barangay_id,trim(p_code),trim(p_name),trim(coalesce(p_description,'')),v_requirements,coalesce(p_public_request_enabled,true))
    returning id into v_type_id;
  insert into public.document_type_events(barangay_id,document_type_id,actor_id,action,new_values)
    values (p_barangay_id,v_type_id,auth.uid(),'created',jsonb_build_object(
      'code',trim(p_code),'name',trim(p_name),'description',trim(coalesce(p_description,'')),
      'requirements',v_requirements,'public_request_enabled',coalesce(p_public_request_enabled,true)));
  return v_type_id;
end;
$$;

create or replace function public.update_document_type(
  p_document_type_id uuid,p_name text,p_description text,p_requirements text[],p_public_request_enabled boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_type public.document_types%rowtype; v_requirements text[];
begin
  select * into v_type from public.document_types where id = p_document_type_id for update;
  if not found or not public.has_tenant_permission(v_type.barangay_id,'document.type.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'name must be between 2 and 120 characters'; end if;
  if length(coalesce(p_description,'')) > 500 then raise exception 'description cannot exceed 500 characters'; end if;
  if p_public_request_enabled is null then raise exception 'request availability is required'; end if;
  v_requirements := public.normalize_document_requirements(p_requirements);
  if v_type.name = trim(p_name) and v_type.description = trim(coalesce(p_description,''))
    and v_type.requirements = v_requirements and v_type.public_request_enabled = p_public_request_enabled then
    raise exception 'no document type changes were provided';
  end if;
  update public.document_types set name = trim(p_name),description = trim(coalesce(p_description,'')),
    requirements = v_requirements,public_request_enabled = p_public_request_enabled
  where id = v_type.id;
  insert into public.document_type_events(barangay_id,document_type_id,actor_id,action,previous_values,new_values)
    values (v_type.barangay_id,v_type.id,auth.uid(),'updated',jsonb_build_object(
      'name',v_type.name,'description',v_type.description,'requirements',v_type.requirements,
      'public_request_enabled',v_type.public_request_enabled),jsonb_build_object(
      'name',trim(p_name),'description',trim(coalesce(p_description,'')),'requirements',v_requirements,
      'public_request_enabled',p_public_request_enabled));
end;
$$;
revoke all on function public.create_document_type(uuid,text,text,text,text[],boolean) from public,anon;
grant execute on function public.create_document_type(uuid,text,text,text,text[],boolean) to authenticated;
revoke all on function public.update_document_type(uuid,text,text,text[],boolean) from public,anon;
grant execute on function public.update_document_type(uuid,text,text,text[],boolean) to authenticated;
