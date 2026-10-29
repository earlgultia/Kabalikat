-- Phase 4: annual budgets and separation-of-duties financial approvals.
insert into public.permissions (key, description)
values ('finance.approve', 'Approve annual budgets and submitted financial transactions')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.role_definitions r cross join public.permissions p
where r.key = 'captain' and p.key = 'finance.approve'
on conflict do nothing;

create table public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  fiscal_year integer not null check (fiscal_year between 2000 and 2200),
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'draft' check (status in ('draft','approved')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, barangay_id),
  unique (barangay_id, fiscal_year, name),
  check (length(trim(name)) between 3 and 120),
  check ((status = 'approved') = (approved_by is not null)),
  check ((status = 'approved') = (approved_at is not null))
);
create index finance_budgets_tenant_year_idx on public.finance_budgets(barangay_id, fiscal_year desc);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  budget_id uuid not null,
  transaction_type text not null check (transaction_type in ('income','expense')),
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null,
  status text not null default 'submitted' check (status in ('submitted','posted','rejected')),
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  foreign key (budget_id, barangay_id) references public.finance_budgets(id, barangay_id) on delete restrict,
  unique (id, barangay_id),
  check (length(trim(category)) between 2 and 80),
  check (length(trim(description)) between 3 and 1000),
  check ((status = 'submitted') = (reviewed_by is null)),
  check ((status = 'submitted') = (reviewed_at is null)),
  check (review_note is null or length(review_note) <= 1000)
);
create index financial_transactions_tenant_date_idx on public.financial_transactions(barangay_id, transaction_date desc);
create index financial_transactions_budget_status_idx on public.financial_transactions(budget_id, status, transaction_type);

create table public.financial_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  budget_id uuid references public.finance_budgets(id) on delete restrict,
  transaction_id uuid references public.financial_transactions(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('budget_submitted','budget_approved','transaction_submitted','transaction_posted','transaction_rejected')),
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (budget_id, barangay_id) references public.finance_budgets(id, barangay_id) on delete restrict,
  foreign key (transaction_id, barangay_id) references public.financial_transactions(id, barangay_id) on delete restrict,
  check ((budget_id is not null) <> (transaction_id is not null))
);
create index financial_events_tenant_idx on public.financial_events(barangay_id, created_at desc);

create or replace function public.create_finance_budget(p_barangay_id uuid, p_fiscal_year integer, p_name text, p_amount numeric)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_budget_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id, 'finance.manage') then raise exception 'not authorized'; end if;
  if p_fiscal_year not between 2000 and 2200 or length(trim(coalesce(p_name,''))) not between 3 and 120
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 999999999999.99 then raise exception 'invalid budget details'; end if;
  insert into public.finance_budgets(barangay_id, fiscal_year, name, amount, created_by)
  values (p_barangay_id, p_fiscal_year, trim(p_name), p_amount, auth.uid()) returning id into v_budget_id;
  insert into public.financial_events(barangay_id, budget_id, actor_id, action, to_status)
  values (p_barangay_id, v_budget_id, auth.uid(), 'budget_submitted', 'draft');
  return v_budget_id;
end;
$$;

create or replace function public.approve_finance_budget(p_budget_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_budget public.finance_budgets%rowtype;
begin
  select * into v_budget from public.finance_budgets where id = p_budget_id for update;
  if not found or not public.has_tenant_permission(v_budget.barangay_id, 'finance.approve') then raise exception 'not authorized'; end if;
  if v_budget.status <> 'draft' then raise exception 'budget is not awaiting approval'; end if;
  if v_budget.created_by = auth.uid() then raise exception 'budget creator cannot approve it'; end if;
  update public.finance_budgets set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
    where id = p_budget_id;
  insert into public.financial_events(barangay_id, budget_id, actor_id, action, from_status, to_status)
  values (v_budget.barangay_id, p_budget_id, auth.uid(), 'budget_approved', 'draft', 'approved');
end;
$$;

create or replace function public.create_financial_transaction(
  p_budget_id uuid, p_type text, p_category text, p_description text, p_amount numeric, p_date date
)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_budget public.finance_budgets%rowtype; v_transaction_id uuid;
begin
  select * into v_budget from public.finance_budgets where id = p_budget_id;
  if not found or not public.has_tenant_permission(v_budget.barangay_id, 'finance.manage') then raise exception 'not authorized'; end if;
  if v_budget.status <> 'approved' then raise exception 'budget must be approved before recording transactions'; end if;
  if p_type not in ('income','expense') or length(trim(coalesce(p_category,''))) not between 2 and 80
    or length(trim(coalesce(p_description,''))) not between 3 and 1000
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 999999999999.99
    or p_date is null or extract(year from p_date)::integer <> v_budget.fiscal_year then raise exception 'invalid transaction details'; end if;
  insert into public.financial_transactions(barangay_id, budget_id, transaction_type, category, description, amount, transaction_date, submitted_by)
  values (v_budget.barangay_id, p_budget_id, p_type, trim(p_category), trim(p_description), p_amount, p_date, auth.uid())
  returning id into v_transaction_id;
  insert into public.financial_events(barangay_id, transaction_id, actor_id, action, to_status)
  values (v_budget.barangay_id, v_transaction_id, auth.uid(), 'transaction_submitted', 'submitted');
  return v_transaction_id;
end;
$$;

create or replace function public.review_financial_transaction(p_transaction_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_transaction public.financial_transactions%rowtype; v_budget public.finance_budgets%rowtype; v_spent numeric(14,2);
begin
  select * into v_transaction from public.financial_transactions where id = p_transaction_id for update;
  if not found or not public.has_tenant_permission(v_transaction.barangay_id, 'finance.approve') then raise exception 'not authorized'; end if;
  if v_transaction.status <> 'submitted' then raise exception 'transaction is not awaiting review'; end if;
  if v_transaction.submitted_by = auth.uid() then raise exception 'transaction submitter cannot review it'; end if;
  if not p_approve and length(trim(coalesce(p_note,''))) < 3 then raise exception 'a reason is required to reject a transaction'; end if;
  select * into v_budget from public.finance_budgets where id = v_transaction.budget_id for update;
  if p_approve and v_transaction.transaction_type = 'expense' then
    select coalesce(sum(t.amount), 0) into v_spent from public.financial_transactions t
      where t.budget_id = v_budget.id and t.status = 'posted' and t.transaction_type = 'expense';
    if v_spent + v_transaction.amount > v_budget.amount then raise exception 'expense exceeds the approved budget'; end if;
  end if;
  update public.financial_transactions set status = case when p_approve then 'posted' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
    where id = p_transaction_id;
  insert into public.financial_events(barangay_id, transaction_id, actor_id, action, from_status, to_status, reason)
  values (v_transaction.barangay_id, p_transaction_id, auth.uid(),
    case when p_approve then 'transaction_posted' else 'transaction_rejected' end,
    'submitted', case when p_approve then 'posted' else 'rejected' end, nullif(trim(p_note), ''));
end;
$$;

alter table public.finance_budgets enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.financial_events enable row level security;
create policy finance_budgets_read on public.finance_budgets for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'finance.read'));
create policy financial_transactions_read on public.financial_transactions for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'finance.read'));
create policy financial_events_read on public.financial_events for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'finance.read'));

revoke all on public.finance_budgets, public.financial_transactions, public.financial_events from anon, authenticated;
grant select on public.finance_budgets, public.financial_transactions, public.financial_events to authenticated;
revoke all on function public.create_finance_budget(uuid,integer,text,numeric) from public, anon;
revoke all on function public.approve_finance_budget(uuid) from public, anon;
revoke all on function public.create_financial_transaction(uuid,text,text,text,numeric,date) from public, anon;
revoke all on function public.review_financial_transaction(uuid,boolean,text) from public, anon;
grant execute on function public.create_finance_budget(uuid,integer,text,numeric) to authenticated;
grant execute on function public.approve_finance_budget(uuid) to authenticated;
grant execute on function public.create_financial_transaction(uuid,text,text,text,numeric,date) to authenticated;
grant execute on function public.review_financial_transaction(uuid,boolean,text) to authenticated;
