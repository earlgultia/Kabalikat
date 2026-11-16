-- Remove free-text descriptions from document audit events when the deleted
-- account is the resident named in those requests. Keep the event rows and
-- actor references so the barangay workflow remains auditable.
create or replace function public.anonymize_resident_document_audit_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.document_request_events audit_event
  set reason = '[Request details removed after account deletion]'
  from public.document_requests request
  join public.residents resident
    on resident.id = request.resident_id and resident.barangay_id = request.barangay_id
  where audit_event.request_id = request.id
    and audit_event.barangay_id = request.barangay_id
    and resident.user_id = old.id
    and audit_event.reason is not null;

  update public.issued_document_events audit_event
  set reason = '[Request details removed after account deletion]'
  from public.issued_documents document
  join public.document_requests request
    on request.id = document.request_id and request.barangay_id = document.barangay_id
  join public.residents resident
    on resident.id = request.resident_id and resident.barangay_id = request.barangay_id
  where audit_event.issued_document_id = document.id
    and audit_event.barangay_id = document.barangay_id
    and resident.user_id = old.id;

  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

revoke all on function public.anonymize_resident_document_audit_before_auth_deletion() from public, anon, authenticated;

drop trigger if exists on_auth_user_document_audit_anonymization on auth.users;
create trigger on_auth_user_document_audit_anonymization
  before delete on auth.users
  for each row execute function public.anonymize_resident_document_audit_before_auth_deletion();

drop trigger if exists on_auth_user_document_audit_soft_anonymization on auth.users;
create trigger on_auth_user_document_audit_soft_anonymization
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.anonymize_resident_document_audit_before_auth_deletion();
