-- Preserve project, outreach, event, and finance decisions while removing
-- optional reviewer free text authored by an erased account.
create or replace function public.redact_member_project_finance_review_notes_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sk_projects project
  set review_note = case when project.status = 'rejected'
    then '[Review note removed after account deletion]' else null end
  where project.reviewed_by = old.id;

  update public.sk_public_accomplishments accomplishment
  set review_note = null
  where accomplishment.reviewed_by = old.id;

  update public.sk_events event
  set review_note = null
  where event.reviewed_by = old.id;

  update public.health_outreach_campaigns campaign
  set review_note = null
  where campaign.reviewed_by = old.id;

  update public.financial_transactions transaction_record
  set review_note = null
  where transaction_record.reviewed_by = old.id;

  update public.finance_budget_amendments amendment
  set review_note = null
  where amendment.reviewed_by = old.id;

  update public.financial_adjustments adjustment
  set review_note = null
  where adjustment.reviewed_by = old.id;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_member_project_finance_review_notes_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_project_finance_review_note_redaction on auth.users;
create trigger on_auth_user_project_finance_review_note_redaction
  before delete on auth.users
  for each row execute function public.redact_member_project_finance_review_notes_before_auth_deletion();

drop trigger if exists on_auth_user_project_finance_review_note_soft_redaction on auth.users;
create trigger on_auth_user_project_finance_review_note_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_member_project_finance_review_notes_before_auth_deletion();

create index if not exists sk_projects_reviewer_idx
  on public.sk_projects (reviewed_by) where reviewed_by is not null;

create index if not exists sk_public_accomplishments_reviewer_idx
  on public.sk_public_accomplishments (reviewed_by) where reviewed_by is not null;

create index if not exists sk_events_reviewer_idx
  on public.sk_events (reviewed_by) where reviewed_by is not null;

create index if not exists health_outreach_campaigns_reviewer_idx
  on public.health_outreach_campaigns (reviewed_by) where reviewed_by is not null;

create index if not exists financial_transactions_reviewer_idx
  on public.financial_transactions (reviewed_by) where reviewed_by is not null;

create index if not exists finance_budget_amendments_reviewer_idx
  on public.finance_budget_amendments (reviewed_by) where reviewed_by is not null;

create index if not exists financial_adjustments_reviewer_idx
  on public.financial_adjustments (reviewed_by) where reviewed_by is not null;
