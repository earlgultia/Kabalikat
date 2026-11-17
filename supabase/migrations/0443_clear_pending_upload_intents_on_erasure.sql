-- Pending upload intents are temporary account-created metadata, not finalized
-- barangay records. Remove them on erasure and leave stored/finalized objects
-- to the existing storage cleanup and retention workflows.
create or replace function public.clear_member_upload_intents_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.archive_upload_intents intent
  where intent.created_by = old.id;

  delete from public.financial_receipt_upload_intents intent
  where intent.created_by = old.id;

  delete from public.incident_evidence_upload_intents intent
  where intent.created_by = old.id;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.clear_member_upload_intents_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_upload_intent_cleanup on auth.users;
create trigger on_auth_user_upload_intent_cleanup
  before delete on auth.users
  for each row execute function public.clear_member_upload_intents_before_auth_deletion();

drop trigger if exists on_auth_user_upload_intent_soft_cleanup on auth.users;
create trigger on_auth_user_upload_intent_soft_cleanup
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.clear_member_upload_intents_before_auth_deletion();
