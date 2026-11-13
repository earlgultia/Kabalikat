-- The filtered finance RPCs have a defaulted fourth parameter. Remove the
-- previous three-argument overloads so calls that omit the filter stay clear.
drop function if exists public.list_finance_budget_page(
  uuid, integer, integer
);

drop function if exists public.list_finance_budget_amendment_page(
  uuid, integer, integer
);
