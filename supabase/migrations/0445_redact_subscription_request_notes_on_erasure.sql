-- Preserve subscription request decisions while removing notes authored by
-- the erased requester or reviewer for both barangay and LGU subscriptions.
create or replace function public.redact_subscription_request_notes_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.subscription_plan_requests request
  set request_note = case when request.requested_by = old.id then '' else request.request_note end,
      admin_note = case when request.reviewed_by = old.id then '' else request.admin_note end
  where request.requested_by = old.id or request.reviewed_by = old.id;

  update public.lgu_subscription_plan_requests request
  set request_note = case when request.requested_by = old.id then '' else request.request_note end,
      admin_note = case when request.reviewed_by = old.id then '' else request.admin_note end
  where request.requested_by = old.id or request.reviewed_by = old.id;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_subscription_request_notes_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_subscription_request_note_redaction on auth.users;
create trigger on_auth_user_subscription_request_note_redaction
  before delete on auth.users
  for each row execute function public.redact_subscription_request_notes_before_auth_deletion();

drop trigger if exists on_auth_user_subscription_request_note_soft_redaction on auth.users;
create trigger on_auth_user_subscription_request_note_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_subscription_request_notes_before_auth_deletion();

create index if not exists subscription_plan_requests_requester_erasure_idx
  on public.subscription_plan_requests (requested_by);
create index if not exists subscription_plan_requests_reviewer_erasure_idx
  on public.subscription_plan_requests (reviewed_by)
  where reviewed_by is not null;
create index if not exists lgu_subscription_plan_requests_requester_erasure_idx
  on public.lgu_subscription_plan_requests (requested_by);
create index if not exists lgu_subscription_plan_requests_reviewer_erasure_idx
  on public.lgu_subscription_plan_requests (reviewed_by)
  where reviewed_by is not null;
