-- Return posted income and adjusted expense totals for every requested budget.
-- The function remains tenant-scoped and uses the caller's finance.read RLS.
drop function public.list_finance_budget_usage_for_page(uuid, uuid[]);

create function public.list_finance_budget_usage_for_page(
  p_barangay_id uuid,
  p_budget_ids uuid[]
)
returns table (
  budget_id uuid,
  posted_expense_total numeric,
  posted_income_total numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select budget.id,
    coalesce(sum(case when transaction_record.transaction_type = 'expense'
      then transaction_record.amount + coalesce(adjustment.total_change, 0)
      else 0 end), 0)::numeric as posted_expense_total,
    coalesce(sum(case when transaction_record.transaction_type = 'income'
      then transaction_record.amount + coalesce(adjustment.total_change, 0)
      else 0 end), 0)::numeric as posted_income_total
  from public.finance_budgets budget
  left join public.financial_transactions transaction_record
    on transaction_record.budget_id = budget.id
   and transaction_record.barangay_id = budget.barangay_id
   and transaction_record.status = 'posted'
  left join lateral (
    select sum(change.amount_change) as total_change
    from public.financial_adjustments change
    where change.transaction_id = transaction_record.id
      and change.barangay_id = transaction_record.barangay_id
      and change.status = 'approved'
  ) adjustment on true
  where budget.barangay_id = p_barangay_id
    and budget.id = any(coalesce(p_budget_ids, array[]::uuid[]))
    and public.has_tenant_permission(p_barangay_id, 'finance.read')
  group by budget.id;
$$;

revoke all on function public.list_finance_budget_usage_for_page(uuid, uuid[]) from public, anon;
grant execute on function public.list_finance_budget_usage_for_page(uuid, uuid[]) to authenticated;
