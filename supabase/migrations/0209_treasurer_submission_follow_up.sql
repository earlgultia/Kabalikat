-- Let Treasurers track their own items that are still waiting for approval.
create index if not exists finance_budgets_treasurer_follow_up_idx
  on public.finance_budgets(barangay_id, created_by)
  where status = 'draft';
create index if not exists financial_transactions_treasurer_follow_up_idx
  on public.financial_transactions(barangay_id, submitted_by)
  where status = 'submitted';
create index if not exists finance_budget_amendments_treasurer_follow_up_idx
  on public.finance_budget_amendments(barangay_id, requested_by)
  where status = 'pending';
create index if not exists financial_adjustments_treasurer_follow_up_idx
  on public.financial_adjustments(barangay_id, requested_by)
  where status = 'pending';

create or replace function public.get_treasurer_follow_up_summary(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_budgets bigint;
  v_transactions bigint;
  v_budget_changes bigint;
  v_transaction_changes bigint;
begin
  if not public.has_tenant_permission(p_barangay_id, 'finance.manage') then
    raise exception 'not authorized';
  end if;

  select count(*) into v_budgets
  from public.finance_budgets budget
  where budget.barangay_id = p_barangay_id
    and budget.status = 'draft'
    and budget.created_by = (select auth.uid());

  select count(*) into v_transactions
  from public.financial_transactions transaction_record
  where transaction_record.barangay_id = p_barangay_id
    and transaction_record.status = 'submitted'
    and transaction_record.submitted_by = (select auth.uid());

  select count(*) into v_budget_changes
  from public.finance_budget_amendments amendment
  where amendment.barangay_id = p_barangay_id
    and amendment.status = 'pending'
    and amendment.requested_by = (select auth.uid());

  select count(*) into v_transaction_changes
  from public.financial_adjustments adjustment
  where adjustment.barangay_id = p_barangay_id
    and adjustment.status = 'pending'
    and adjustment.requested_by = (select auth.uid());

  return jsonb_build_object(
    'budgets_awaiting_approval', v_budgets,
    'transactions_awaiting_review', v_transactions,
    'budget_changes_awaiting_review', v_budget_changes,
    'transaction_changes_awaiting_review', v_transaction_changes,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_treasurer_follow_up_summary(uuid) from public, anon;
grant execute on function public.get_treasurer_follow_up_summary(uuid) to authenticated;
