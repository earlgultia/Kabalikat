-- Keep the Captain's finance shortcut aligned with the dashboard total while
-- retaining the Treasurer's existing personal follow-up filters.
drop function if exists public.list_finance_budget_page(uuid, integer, integer, boolean);
drop function if exists public.list_finance_budget_amendment_page(uuid, integer, integer, boolean);

create function public.list_finance_budget_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_mine_pending_only boolean default false,
  p_captain_review_only boolean default false
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
      and (
        (coalesce(p_mine_pending_only, false)
          and b.status = 'draft' and b.created_by = (select auth.uid()))
        or (coalesce(p_captain_review_only, false)
          and b.status = 'draft' and b.created_by <> (select auth.uid()))
        or (not coalesce(p_mine_pending_only, false)
          and not coalesce(p_captain_review_only, false))
      )
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

create function public.list_finance_budget_amendment_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 25,
  p_mine_pending_only boolean default false,
  p_captain_review_only boolean default false
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
      and (
        (coalesce(p_mine_pending_only, false)
          and a.status = 'pending' and a.requested_by = (select auth.uid()))
        or (coalesce(p_captain_review_only, false)
          and a.status = 'pending' and a.requested_by <> (select auth.uid()))
        or (not coalesce(p_mine_pending_only, false)
          and not coalesce(p_captain_review_only, false))
      )
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

revoke all on function public.list_finance_budget_page(uuid, integer, integer, boolean, boolean) from public, anon;
revoke all on function public.list_finance_budget_amendment_page(uuid, integer, integer, boolean, boolean) from public, anon;
grant execute on function public.list_finance_budget_page(uuid, integer, integer, boolean, boolean) to authenticated;
grant execute on function public.list_finance_budget_amendment_page(uuid, integer, integer, boolean, boolean) to authenticated;
