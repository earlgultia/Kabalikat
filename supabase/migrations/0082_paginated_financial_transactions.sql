-- Provide stable paging for the finance ledger and complete expense totals without loading the full ledger.
create index if not exists financial_transactions_tenant_date_page_idx
  on public.financial_transactions(barangay_id, transaction_date desc, id desc);

create or replace function public.list_finance_budget_usage(p_barangay_id uuid)
returns table (
  budget_id uuid,
  posted_expense_total numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.budget_id,
    coalesce(sum(t.amount + coalesce(adjusted.total_change, 0)), 0)::numeric as posted_expense_total
  from public.financial_transactions t
  left join lateral (
    select sum(a.amount_change) as total_change
    from public.financial_adjustments a
    where a.transaction_id = t.id
      and a.barangay_id = t.barangay_id
      and a.status = 'approved'
  ) adjusted on true
  where t.barangay_id = p_barangay_id
    and t.transaction_type = 'expense'
    and t.status = 'posted'
    and public.has_tenant_permission(p_barangay_id, 'finance.read')
  group by t.budget_id;
$$;

revoke all on function public.list_finance_budget_usage(uuid) from public, anon;
grant execute on function public.list_finance_budget_usage(uuid) to authenticated;
