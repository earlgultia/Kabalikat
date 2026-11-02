-- Preserve the office signatory configured when each document is issued.
-- Older records intentionally remain blank because their historical signatory
-- cannot be reconstructed from the current office settings.
alter table public.issued_documents
  add column signatory_name_snapshot text not null default ''
    check (char_length(signatory_name_snapshot) <= 120),
  add column signatory_title_snapshot text not null default ''
    check (char_length(signatory_title_snapshot) <= 120),
  add constraint issued_documents_signatory_snapshot_pair_check
    check ((signatory_name_snapshot = '') = (signatory_title_snapshot = ''));

create or replace function public.snapshot_issued_document_signatory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select coalesce(settings.document_signatory_name, ''),
         coalesce(settings.document_signatory_title, '')
    into new.signatory_name_snapshot, new.signatory_title_snapshot
  from public.barangay_office_settings settings
  where settings.barangay_id = new.barangay_id;

  if not found then
    new.signatory_name_snapshot := '';
    new.signatory_title_snapshot := '';
  end if;

  return new;
end;
$$;

revoke all on function public.snapshot_issued_document_signatory() from public, anon, authenticated;

create trigger issued_documents_snapshot_signatory_before_insert
before insert on public.issued_documents
for each row execute function public.snapshot_issued_document_signatory();
