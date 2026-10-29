-- Phase 4: auditable finance report exports.
create table public.finance_report_exports (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  exported_by uuid not null references public.profiles(id) on delete restrict,
  date_from date not null,
  date_to date not null,
  row_count integer not null check (row_count between 0 and 100000),
  created_at timestamptz not null default now(),
  check (date_to >= date_from),
  check (date_to - date_from <= 3660)
);
create index finance_report_exports_tenant_idx on public.finance_report_exports(barangay_id, created_at desc);

create or replace function public.record_finance_report_export(p_barangay_id uuid, p_date_from date, p_date_to date, p_row_count integer)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id, 'finance.read') then raise exception 'not authorized'; end if;
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from
    or p_date_to - p_date_from > 3660 or p_row_count is null or p_row_count not between 0 and 100000 then
    raise exception 'invalid finance report export details';
  end if;
  insert into public.finance_report_exports(barangay_id, exported_by, date_from, date_to, row_count)
  values (p_barangay_id, auth.uid(), p_date_from, p_date_to, p_row_count) returning id into v_id;
  return v_id;
end;
$$;

alter table public.finance_report_exports enable row level security;
create policy finance_report_exports_read on public.finance_report_exports for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'finance.read'));
revoke all on public.finance_report_exports from anon, authenticated;
grant select on public.finance_report_exports to authenticated;
revoke all on function public.record_finance_report_export(uuid,date,date,integer) from public, anon;
grant execute on function public.record_finance_report_export(uuid,date,date,integer) to authenticated;
