-- Remove a deleted member's personal number from shared emergency-contact
-- records. Keep the resource and its history, but archive it when its number
-- can no longer be safely used.

do $$
declare
  v_constraint_name text;
begin
  select constraint_row.conname
    into v_constraint_name
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.disaster_emergency_resources'::regclass
    and constraint_row.contype = 'c'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid)
      ilike '%resource_type%emergency_contact%phone%IS NOT NULL%';

  if v_constraint_name is not null then
    execute pg_catalog.format(
      'alter table public.disaster_emergency_resources drop constraint %I',
      v_constraint_name
    );
  end if;
end;
$$;

alter table public.disaster_emergency_resources
  drop constraint if exists disaster_emergency_resources_published_contact_phone_check;

alter table public.disaster_emergency_resources
  add constraint disaster_emergency_resources_published_contact_phone_check
  check (status <> 'published' or resource_type <> 'emergency_contact' or phone is not null);

create or replace function public.redact_erased_member_emergency_contact_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.phone is not null and pg_catalog.regexp_replace(old.phone, '[^0-9]', '', 'g') <> '' then
    update public.disaster_emergency_resources resource
    set phone = null,
        status = 'archived',
        archived_by = case when resource.status = 'archived'
          then resource.archived_by else old.id end,
        archived_at = case when resource.status = 'archived'
          then resource.archived_at else pg_catalog.now() end,
        updated_at = pg_catalog.now()
    where resource.resource_type = 'emergency_contact'
      and resource.phone is not null
      and pg_catalog.regexp_replace(resource.phone, '[^0-9]', '', 'g')
        = pg_catalog.regexp_replace(old.phone, '[^0-9]', '', 'g');
  end if;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_erased_member_emergency_contact_phone()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_emergency_contact_phone_redaction on auth.users;
create trigger on_auth_user_emergency_contact_phone_redaction
  before delete on auth.users
  for each row execute function public.redact_erased_member_emergency_contact_phone();

drop trigger if exists on_auth_user_emergency_contact_phone_soft_redaction on auth.users;
create trigger on_auth_user_emergency_contact_phone_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_erased_member_emergency_contact_phone();
