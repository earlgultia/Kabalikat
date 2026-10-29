-- Phase 3: tenant-isolated archive metadata and private file storage.
insert into public.permissions (key, description) values
  ('archive.read', 'Read tenant archive metadata and approved files'),
  ('archive.manage', 'Create archive folders, upload files, and review searchable text')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.role_definitions r
cross join public.permissions p
where (r.key = 'captain' and p.key in ('archive.read','archive.manage'))
   or (r.key = 'secretary' and p.key in ('archive.read','archive.manage'))
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('barangay-archive', 'barangay-archive', false, 20971520, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png'];

create table public.archive_folders (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  parent_id uuid,
  name text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, barangay_id),
  foreign key (parent_id, barangay_id) references public.archive_folders(id, barangay_id) on delete restrict,
  check (length(trim(name)) between 1 and 80),
  check (position('/' in name) = 0 and position(chr(92) in name) = 0)
);
create unique index archive_folders_root_name_idx on public.archive_folders(barangay_id, lower(name)) where parent_id is null;
create unique index archive_folders_child_name_idx on public.archive_folders(barangay_id, parent_id, lower(name)) where parent_id is not null;

create table public.archive_documents (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  folder_id uuid,
  file_name text not null,
  description text not null default '',
  category text not null default 'General',
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  file_size bigint not null check (file_size between 1 and 20971520),
  storage_path text not null unique,
  extracted_text text not null default '',
  text_status text not null default 'not_added' check (text_status in ('not_added','draft','reviewed')),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, barangay_id),
  foreign key (folder_id, barangay_id) references public.archive_folders(id, barangay_id) on delete restrict,
  check (length(trim(file_name)) between 1 and 180),
  check (length(description) <= 1000),
  check (length(trim(category)) between 1 and 60),
  check (length(extracted_text) <= 200000),
  check ((length(extracted_text) = 0) = (text_status = 'not_added')),
  check (storage_path = barangay_id::text || '/' || id::text || '/' || file_name)
);
create index archive_documents_tenant_date_idx on public.archive_documents(barangay_id, created_at desc);
create index archive_documents_folder_idx on public.archive_documents(folder_id, created_at desc);

create table public.archive_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  document_id uuid,
  folder_id uuid,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('folder_created','file_uploaded','text_saved','text_reviewed')),
  created_at timestamptz not null default now(),
  foreign key (document_id, barangay_id) references public.archive_documents(id, barangay_id) on delete restrict,
  foreign key (folder_id, barangay_id) references public.archive_folders(id, barangay_id) on delete restrict,
  check ((action = 'folder_created') = (folder_id is not null)),
  check ((action = 'folder_created') or (document_id is not null))
);
create index archive_events_tenant_idx on public.archive_events(barangay_id, created_at desc);

create table public.archive_upload_intents (
  id uuid primary key,
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  folder_id uuid,
  file_name text not null,
  description text not null default '',
  category text not null,
  mime_type text not null,
  file_size bigint not null,
  storage_path text not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  foreign key (folder_id, barangay_id) references public.archive_folders(id, barangay_id) on delete restrict
);

create or replace function public.create_archive_folder(p_barangay_id uuid, p_name text, p_parent_id uuid default null)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_folder_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id, 'archive.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 80
    or position('/' in p_name) > 0 or position(chr(92) in p_name) > 0 then raise exception 'invalid folder name'; end if;
  if p_parent_id is not null and not exists (
    select 1 from public.archive_folders f where f.id = p_parent_id and f.barangay_id = p_barangay_id
  ) then raise exception 'parent folder not found'; end if;
  insert into public.archive_folders(barangay_id, parent_id, name, created_by)
  values (p_barangay_id, p_parent_id, trim(p_name), auth.uid()) returning id into v_folder_id;
  insert into public.archive_events(barangay_id, folder_id, actor_id, action)
  values (p_barangay_id, v_folder_id, auth.uid(), 'folder_created');
  return v_folder_id;
end;
$$;

create or replace function public.create_archive_upload_intent(
  p_barangay_id uuid, p_document_id uuid, p_folder_id uuid, p_file_name text,
  p_description text, p_category text, p_mime_type text, p_file_size bigint
)
returns text language plpgsql security definer
set search_path = ''
as $$
declare v_storage_path text;
begin
  if not public.has_tenant_permission(p_barangay_id, 'archive.manage') then raise exception 'not authorized'; end if;
  if p_folder_id is not null and not exists (
    select 1 from public.archive_folders f where f.id = p_folder_id and f.barangay_id = p_barangay_id
  ) then raise exception 'archive folder not found'; end if;
  if length(trim(coalesce(p_file_name, ''))) not between 1 and 180
    or position('/' in p_file_name) > 0 or position(chr(92) in p_file_name) > 0
    or length(coalesce(p_description, '')) > 1000 or length(trim(coalesce(p_category, ''))) not between 1 and 60
    or p_mime_type is null or p_mime_type not in ('application/pdf','image/jpeg','image/png')
    or p_file_size is null or p_file_size not between 1 and 20971520 then raise exception 'invalid archive file details'; end if;
  v_storage_path := p_barangay_id::text || '/' || p_document_id::text || '/' || trim(p_file_name);
  insert into public.archive_upload_intents(
    id, barangay_id, folder_id, file_name, description, category, mime_type, file_size, storage_path, created_by, expires_at
  ) values (
    p_document_id, p_barangay_id, p_folder_id, trim(p_file_name), trim(coalesce(p_description, '')),
    trim(p_category), p_mime_type, p_file_size, v_storage_path, auth.uid(), now() + interval '30 minutes'
  );
  return v_storage_path;
end;
$$;

create or replace function public.register_archive_document(p_document_id uuid)
returns text language plpgsql security definer
set search_path = ''
as $$
declare v_intent public.archive_upload_intents%rowtype; v_object_mime text; v_object_size bigint;
begin
  select * into v_intent from public.archive_upload_intents i
    where i.id = p_document_id and i.created_by = auth.uid() for update;
  if not found or v_intent.expires_at <= now()
    or not public.has_tenant_permission(v_intent.barangay_id, 'archive.manage') then raise exception 'upload authorization expired'; end if;
  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint
    into v_object_mime, v_object_size from storage.objects o
    where o.bucket_id = 'barangay-archive' and o.name = v_intent.storage_path;
  if not found or v_object_mime is distinct from v_intent.mime_type or v_object_size is distinct from v_intent.file_size then
    raise exception 'uploaded file not found or does not match its upload authorization';
  end if;
  insert into public.archive_documents(
    id, barangay_id, folder_id, file_name, description, category, mime_type, file_size, storage_path, uploaded_by
  ) values (
    v_intent.id, v_intent.barangay_id, v_intent.folder_id, v_intent.file_name, v_intent.description,
    v_intent.category, v_intent.mime_type, v_intent.file_size, v_intent.storage_path, auth.uid()
  );
  insert into public.archive_events(barangay_id, document_id, actor_id, action)
  values (v_intent.barangay_id, v_intent.id, auth.uid(), 'file_uploaded');
  delete from public.archive_upload_intents where id = v_intent.id;
  return v_intent.storage_path;
end;
$$;

create or replace function public.save_archive_text(p_document_id uuid, p_text text, p_reviewed boolean default false)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_document public.archive_documents%rowtype; v_status text; v_action text;
begin
  select * into v_document from public.archive_documents where id = p_document_id for update;
  if not found or not public.has_tenant_permission(v_document.barangay_id, 'archive.manage') then raise exception 'not authorized'; end if;
  if length(coalesce(p_text, '')) > 200000 then raise exception 'searchable text is too long'; end if;
  v_status := case when length(coalesce(p_text, '')) = 0 then 'not_added' when p_reviewed then 'reviewed' else 'draft' end;
  v_action := case when p_reviewed then 'text_reviewed' else 'text_saved' end;
  update public.archive_documents set extracted_text = coalesce(p_text, ''), text_status = v_status, updated_at = now()
    where id = p_document_id;
  insert into public.archive_events(barangay_id, document_id, actor_id, action)
  values (v_document.barangay_id, p_document_id, auth.uid(), v_action);
end;
$$;

create or replace function public.search_archive_documents(p_barangay_id uuid, p_query text default null, p_folder_id uuid default null)
returns table (
  id uuid, folder_id uuid, file_name text, description text, category text, mime_type text,
  file_size bigint, storage_path text, extracted_text text, text_status text, created_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_permission(p_barangay_id, 'archive.read') then raise exception 'not authorized'; end if;
  if length(coalesce(p_query, '')) > 120 then raise exception 'search query is too long'; end if;
  if p_folder_id is not null and not exists (
    select 1 from public.archive_folders f where f.id = p_folder_id and f.barangay_id = p_barangay_id
  ) then raise exception 'archive folder not found'; end if;
  return query
    select d.id, d.folder_id, d.file_name, d.description, d.category, d.mime_type,
      d.file_size, d.storage_path, d.extracted_text, d.text_status, d.created_at
    from public.archive_documents d
    where d.barangay_id = p_barangay_id
      and (p_folder_id is null or d.folder_id = p_folder_id)
      and (coalesce(trim(p_query), '') = '' or d.file_name ilike '%' || trim(p_query) || '%'
        or d.description ilike '%' || trim(p_query) || '%' or d.extracted_text ilike '%' || trim(p_query) || '%')
    order by d.created_at desc limit 200;
end;
$$;

alter table public.archive_folders enable row level security;
alter table public.archive_documents enable row level security;
alter table public.archive_events enable row level security;
alter table public.archive_upload_intents enable row level security;
create policy archive_folders_read on public.archive_folders for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'archive.read'));
create policy archive_documents_read on public.archive_documents for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'archive.read'));
create policy archive_events_read on public.archive_events for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'archive.read'));
create policy archive_upload_intents_read_own on public.archive_upload_intents for select to authenticated
  using (created_by = (select auth.uid()) and public.has_tenant_permission(barangay_id, 'archive.manage'));

create policy archive_storage_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'barangay-archive' and exists (
    select 1 from public.archive_upload_intents i
    where i.storage_path = name and i.created_by = (select auth.uid())
      and i.expires_at > now() and public.has_tenant_permission(i.barangay_id, 'archive.manage')
  ));
create policy archive_storage_download on storage.objects for select to authenticated
  using (bucket_id = 'barangay-archive' and exists (
    select 1 from public.archive_documents d
    where d.storage_path = name and public.has_tenant_permission(d.barangay_id, 'archive.read')
  ));

revoke all on public.archive_folders, public.archive_documents, public.archive_events, public.archive_upload_intents from anon, authenticated;
grant select on public.archive_folders, public.archive_documents, public.archive_events to authenticated;
grant select on public.archive_upload_intents to authenticated;
revoke all on function public.create_archive_folder(uuid,text,uuid) from public, anon;
revoke all on function public.create_archive_upload_intent(uuid,uuid,uuid,text,text,text,text,bigint) from public, anon;
revoke all on function public.register_archive_document(uuid) from public, anon;
revoke all on function public.save_archive_text(uuid,text,boolean) from public, anon;
revoke all on function public.search_archive_documents(uuid,text,uuid) from public, anon;
grant execute on function public.create_archive_folder(uuid,text,uuid) to authenticated;
grant execute on function public.create_archive_upload_intent(uuid,uuid,uuid,text,text,text,text,bigint) to authenticated;
grant execute on function public.register_archive_document(uuid) to authenticated;
grant execute on function public.save_archive_text(uuid,text,boolean) to authenticated;
grant execute on function public.search_archive_documents(uuid,text,uuid) to authenticated;
