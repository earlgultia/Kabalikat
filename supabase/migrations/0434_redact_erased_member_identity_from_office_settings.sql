-- Remove an erased member's personal identifiers from public office settings
-- only when the saved values match that account. Preserve unrelated office data.
create or replace function public.redact_member_office_contact_identity_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := coalesce(
    nullif(trim(old.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(old.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(old.raw_user_meta_data ->> 'name'), '')
  );
begin
  update public.barangay_office_settings settings
  set public_contact_email = case
        when nullif(lower(trim(settings.public_contact_email)), '') = nullif(lower(trim(old.email::text)), '')
          then '' else settings.public_contact_email end,
      public_contact_phone = case
        when nullif(trim(settings.public_contact_phone), '') = nullif(trim(old.phone::text), '')
          then '' else settings.public_contact_phone end,
      document_signatory_name = case
        when v_full_name is not null
          and lower(trim(settings.document_signatory_name)) = lower(v_full_name)
          then '' else settings.document_signatory_name end,
      updated_at = now()
  where (nullif(lower(trim(settings.public_contact_email)), '') is not null
      and nullif(lower(trim(settings.public_contact_email)), '') = nullif(lower(trim(old.email::text)), ''))
     or (nullif(trim(settings.public_contact_phone), '') is not null
      and nullif(trim(settings.public_contact_phone), '') = nullif(trim(old.phone::text), ''))
     or (v_full_name is not null
      and lower(trim(settings.document_signatory_name)) = lower(v_full_name));

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_member_office_contact_identity_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_office_contact_identity_redaction on auth.users;
create trigger on_auth_user_office_contact_identity_redaction
  before delete on auth.users
  for each row execute function public.redact_member_office_contact_identity_before_auth_deletion();

drop trigger if exists on_auth_user_office_contact_identity_soft_redaction on auth.users;
create trigger on_auth_user_office_contact_identity_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_member_office_contact_identity_before_auth_deletion();
