-- On hard delete, the main cleanup trigger anonymizes profiles.display_name.
-- Run issued-document snapshot matching first so it can still use the profile
-- name when auth metadata does not contain a full name.
drop trigger if exists on_auth_user_issued_signatory_redaction on auth.users;
drop trigger if exists aa_on_auth_user_issued_signatory_redaction on auth.users;
create trigger aa_on_auth_user_issued_signatory_redaction
  before delete on auth.users
  for each row
  execute function public.redact_issued_document_signatory_before_auth_deletion();
