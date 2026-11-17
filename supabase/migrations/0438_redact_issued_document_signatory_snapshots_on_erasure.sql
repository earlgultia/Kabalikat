-- Preserve issued documents while removing a deleted account's copied name
-- when that account was both the issuer and the recorded signatory.
create or replace function public.redact_issued_document_signatory_before_auth_deletion()
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
  if v_full_name is null then
    select nullif(trim(profile.display_name), '')
      into v_full_name
    from public.profiles profile
    where profile.id = old.id;
  end if;

  if v_full_name is not null then
    update public.issued_documents document
    set signatory_name_snapshot = '',
        signatory_title_snapshot = ''
    where document.issued_by = old.id
      and lower(trim(document.signatory_name_snapshot)) = lower(v_full_name);
  end if;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_issued_document_signatory_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_issued_signatory_redaction on auth.users;
create trigger on_auth_user_issued_signatory_redaction
  before delete on auth.users
  for each row execute function public.redact_issued_document_signatory_before_auth_deletion();

drop trigger if exists on_auth_user_issued_signatory_soft_redaction on auth.users;
create trigger on_auth_user_issued_signatory_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_issued_document_signatory_before_auth_deletion();
