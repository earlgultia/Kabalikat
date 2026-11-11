-- Derive the audited export row count from tenant-scoped records instead of
-- trusting a count supplied by the browser.
create or replace function public.record_finance_report_export(
  p_barangay_id uuid,
  p_date_from date,
  p_date_to date,
  p_row_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_row_count bigint;
begin
  if not public.has_tenant_permission(p_barangay_id, 'finance.read') then
    raise exception 'not authorized';
  end if;

  if p_date_from is null or p_date_to is null or p_date_to < p_date_from
    or p_date_to - p_date_from > 3660
    or p_row_count is null or p_row_count not between 0 and 100000 then
    raise exception 'invalid finance report export details';
  end if;

  select
    (select count(*)
     from public.financial_transactions t
     where t.barangay_id = p_barangay_id
       and t.transaction_date between p_date_from and p_date_to)
    +
    (select count(*)
     from public.financial_adjustments a
     join public.financial_transactions t
       on t.id = a.transaction_id
      and t.barangay_id = a.barangay_id
     where t.barangay_id = p_barangay_id
       and t.transaction_date between p_date_from and p_date_to)
  into v_row_count;

  if v_row_count > 100000 or p_row_count::bigint <> v_row_count then
    raise exception 'finance report rows changed; refresh and export again';
  end if;

  insert into public.finance_report_exports(barangay_id, exported_by, date_from, date_to, row_count)
  values (p_barangay_id, auth.uid(), p_date_from, p_date_to, v_row_count::integer)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_finance_report_export(uuid, date, date, integer) from public, anon;
grant execute on function public.record_finance_report_export(uuid, date, date, integer) to authenticated;
