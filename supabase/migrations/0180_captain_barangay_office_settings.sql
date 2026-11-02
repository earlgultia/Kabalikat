-- Let the Captain maintain tenant office details and printed document signatory information.
insert into public.permissions(key, description)
values ('tenant.settings.manage', 'Manage barangay office and document signatory settings')
on conflict (key) do nothing;

insert into public.role_permissions(role_id, permission_id)
select rdef.id, perm.id
from public.role_definitions as rdef
join public.permissions as perm on perm.key = 'tenant.settings.manage'
where rdef.key = 'captain' and rdef.scope = 'barangay'
on conflict do nothing;

create table public.barangay_office_settings (
  barangay_id uuid primary key references public.barangays(id) on delete restrict,
  office_address text not null default '' check (char_length(office_address) <= 300),
  public_contact_phone text not null default '' check (char_length(public_contact_phone) <= 40),
  public_contact_email text not null default '' check (char_length(public_contact_email) <= 254),
  office_hours text not null default '' check (char_length(office_hours) <= 300),
  document_signatory_name text not null default '' check (char_length(document_signatory_name) <= 120),
  document_signatory_title text not null default '' check (char_length(document_signatory_title) <= 120),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.barangay_office_settings_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  changed_fields text[] not null check (cardinality(changed_fields) between 1 and 6),
  created_at timestamptz not null default now()
);

create index barangay_office_settings_events_tenant_idx
  on public.barangay_office_settings_events(barangay_id, created_at desc, id desc);

alter table public.barangay_office_settings enable row level security;
alter table public.barangay_office_settings_events enable row level security;

create policy barangay_office_settings_captain_read on public.barangay_office_settings
  for select to authenticated using (public.has_tenant_permission(barangay_id, 'tenant.settings.manage'));
create policy barangay_office_settings_events_captain_read on public.barangay_office_settings_events
  for select to authenticated using (public.has_tenant_permission(barangay_id, 'tenant.settings.manage'));

revoke all on public.barangay_office_settings, public.barangay_office_settings_events from anon, authenticated;
grant select on public.barangay_office_settings, public.barangay_office_settings_events to authenticated;

create or replace function public.update_barangay_office_settings(
  p_barangay_id uuid,
  p_office_address text,
  p_public_contact_phone text,
  p_public_contact_email text,
  p_office_hours text,
  p_document_signatory_name text,
  p_document_signatory_title text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.barangay_office_settings%rowtype;
  v_address text := trim(coalesce(p_office_address, ''));
  v_phone text := trim(coalesce(p_public_contact_phone, ''));
  v_email text := lower(trim(coalesce(p_public_contact_email, '')));
  v_hours text := trim(coalesce(p_office_hours, ''));
  v_signatory_name text := trim(coalesce(p_document_signatory_name, ''));
  v_signatory_title text := trim(coalesce(p_document_signatory_title, ''));
  v_changed_fields text[] := '{}'::text[];
begin
  if not public.has_tenant_permission(p_barangay_id, 'tenant.settings.manage') then
    raise exception 'not authorized';
  end if;
  perform 1 from public.barangays where id = p_barangay_id for update;
  if not found then raise exception 'barangay not found'; end if;
  if char_length(v_address) > 300 or char_length(v_phone) > 40 or char_length(v_email) > 254
    or char_length(v_hours) > 300 or char_length(v_signatory_name) > 120 or char_length(v_signatory_title) > 120 then
    raise exception 'one or more settings exceed the allowed length';
  end if;
  if v_email <> '' and v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'enter a valid public contact email';
  end if;
  if (v_signatory_name = '') <> (v_signatory_title = '') then
    raise exception 'provide both the signatory name and title, or leave both blank';
  end if;

  select settings.* into v_before
  from public.barangay_office_settings settings
  where settings.barangay_id = p_barangay_id
  for update;

  if v_address is distinct from coalesce(v_before.office_address, '') then v_changed_fields := array_append(v_changed_fields, 'office_address'); end if;
  if v_phone is distinct from coalesce(v_before.public_contact_phone, '') then v_changed_fields := array_append(v_changed_fields, 'public_contact_phone'); end if;
  if v_email is distinct from coalesce(v_before.public_contact_email, '') then v_changed_fields := array_append(v_changed_fields, 'public_contact_email'); end if;
  if v_hours is distinct from coalesce(v_before.office_hours, '') then v_changed_fields := array_append(v_changed_fields, 'office_hours'); end if;
  if v_signatory_name is distinct from coalesce(v_before.document_signatory_name, '') then v_changed_fields := array_append(v_changed_fields, 'document_signatory_name'); end if;
  if v_signatory_title is distinct from coalesce(v_before.document_signatory_title, '') then v_changed_fields := array_append(v_changed_fields, 'document_signatory_title'); end if;
  if cardinality(v_changed_fields) = 0 then raise exception 'no settings changed'; end if;

  insert into public.barangay_office_settings(
    barangay_id, office_address, public_contact_phone, public_contact_email, office_hours,
    document_signatory_name, document_signatory_title, updated_by, updated_at
  ) values (
    p_barangay_id, v_address, v_phone, v_email, v_hours,
    v_signatory_name, v_signatory_title, (select auth.uid()), now()
  )
  on conflict (barangay_id) do update set
    office_address = excluded.office_address,
    public_contact_phone = excluded.public_contact_phone,
    public_contact_email = excluded.public_contact_email,
    office_hours = excluded.office_hours,
    document_signatory_name = excluded.document_signatory_name,
    document_signatory_title = excluded.document_signatory_title,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.barangay_office_settings_events(barangay_id, actor_id, changed_fields)
  values (p_barangay_id, (select auth.uid()), v_changed_fields);
end;
$$;

revoke all on function public.update_barangay_office_settings(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_barangay_office_settings(uuid, text, text, text, text, text, text) to authenticated;
