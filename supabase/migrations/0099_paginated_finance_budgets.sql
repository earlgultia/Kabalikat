-- Bound annual budget and amendment history reads for the finance workspace.
create index if not exists finance_budgets_tenant_year_page_idx
  on public.finance_budgets(barangay_id, fiscal_year desc, name, id);

create index if not exists finance_budget_amendments_tenant_created_page_idx
  on public.finance_budget_amendments(barangay_id, created_at desc, id desc);

create index if not exists finance_budget_amendments_pending_budget_idx
  on public.finance_budget_amendments(budget_id)
  where status = 'pending';

create or replace function public.list_finance_budget_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20
)
returns table (
  id uuid,
  fiscal_year integer,
  name text,
  amount numeric,
  status text,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz,
  approved_at timestamptz,
  has_pending_amendment boolean,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
begin
  return query
  with budget_rows as (
    select b.id, b.fiscal_year, b.name, b.amount, b.status::text as status,
      b.created_by, b.approved_by, b.created_at, b.approved_at,
      exists (
        select 1 from public.finance_budget_amendments a
        where a.budget_id = b.id and a.status = 'pending'
      ) as has_pending_amendment
    from public.finance_budgets b
    where b.barangay_id = p_barangay_id
  ), counted as (
    select budget_rows.*, count(*) over () as total_count
    from budget_rows
  )
  select counted.id, counted.fiscal_year, counted.name, counted.amount,
    counted.status, counted.created_by, counted.approved_by, counted.created_at,
    counted.approved_at, counted.has_pending_amendment, counted.total_count
  from counted
  order by counted.fiscal_year desc, counted.name, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

create or replace function public.list_finance_budget_amendment_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 25
)
returns table (
  id uuid,
  budget_id uuid,
  budget_name text,
  fiscal_year integer,
  requested_amount numeric,
  reason text,
  status text,
  requested_by uuid,
  reviewed_by uuid,
  review_note text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  return query
  with amendment_rows as (
    select a.id, a.budget_id, b.name as budget_name, b.fiscal_year,
      a.requested_amount, a.reason, a.status::text as status,
      a.requested_by, a.reviewed_by, a.review_note, a.created_at
    from public.finance_budget_amendments a
    join public.finance_budgets b on b.id = a.budget_id and b.barangay_id = a.barangay_id
    where a.barangay_id = p_barangay_id
  ), counted as (
    select amendment_rows.*, count(*) over () as total_count
    from amendment_rows
  )
  select counted.id, counted.budget_id, counted.budget_name, counted.fiscal_year,
    counted.requested_amount, counted.reason, counted.status, counted.requested_by,
    counted.reviewed_by, counted.review_note, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_finance_budget_page(uuid, integer, integer) from public, anon;
revoke all on function public.list_finance_budget_amendment_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_finance_budget_page(uuid, integer, integer) to authenticated;
grant execute on function public.list_finance_budget_amendment_page(uuid, integer, integer) to authenticated;

create or replace function public.list_finance_budget_usage_for_page(
  p_barangay_id uuid,
  p_budget_ids uuid[]
)
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
  join public.finance_budgets b on b.id = t.budget_id and b.barangay_id = p_barangay_id
  left join lateral (
    select sum(a.amount_change) as total_change
    from public.financial_adjustments a
    where a.transaction_id = t.id
      and a.barangay_id = t.barangay_id
      and a.status = 'approved'
  ) adjusted on true
  where t.barangay_id = p_barangay_id
    and t.budget_id = any(coalesce(p_budget_ids, array[]::uuid[]))
    and t.transaction_type = 'expense'
    and t.status = 'posted'
    and public.has_tenant_permission(p_barangay_id, 'finance.read')
  group by t.budget_id;
$$;

revoke all on function public.list_finance_budget_usage_for_page(uuid, uuid[]) from public, anon;
grant execute on function public.list_finance_budget_usage_for_page(uuid, uuid[]) to authenticated;
