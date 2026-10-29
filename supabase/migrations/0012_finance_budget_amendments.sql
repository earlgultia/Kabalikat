-- Phase 4: change approved budgets through independently reviewed amendment requests.
alter table public.financial_events drop constraint financial_events_action_check;
alter table public.financial_events add constraint financial_events_action_check check (action in (
  'budget_submitted','budget_approved','transaction_submitted','transaction_posted','transaction_rejected',
  'transaction_voided','receipt_attached','budget_amendment_submitted','budget_amendment_approved','budget_amendment_rejected'
));

create table public.finance_budget_amendments (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  budget_id uuid not null,
  requested_amount numeric(14,2) not null check (requested_amount > 0),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  foreign key (budget_id, barangay_id) references public.finance_budgets(id, barangay_id) on delete restrict,
  check ((status = 'pending') = (reviewed_by is null)),
  check ((status = 'pending') = (reviewed_at is null)),
  check (review_note is null or length(review_note) <= 1000)
);
create index finance_budget_amendments_budget_idx on public.finance_budget_amendments(budget_id, created_at desc);

create or replace function public.request_finance_budget_amendment(p_budget_id uuid, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_budget public.finance_budgets%rowtype; v_id uuid;
begin
  select * into v_budget from public.finance_budgets where id = p_budget_id for update;
  if not found or not public.has_tenant_permission(v_budget.barangay_id, 'finance.manage') then raise exception 'not authorized'; end if;
  if v_budget.status <> 'approved' then raise exception 'only approved budgets can be amended'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 999999999999.99
    or p_amount = v_budget.amount or length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'invalid budget amendment'; end if;
  if exists (select 1 from public.finance_budget_amendments a where a.budget_id = v_budget.id and a.status = 'pending') then
    raise exception 'this budget already has a pending amendment';
  end if;
  insert into public.finance_budget_amendments(barangay_id,budget_id,requested_amount,reason,requested_by)
  values (v_budget.barangay_id,v_budget.id,p_amount,trim(p_reason),auth.uid()) returning id into v_id;
  insert into public.financial_events(barangay_id,budget_id,actor_id,action,from_status,to_status,reason)
  values (v_budget.barangay_id,v_budget.id,auth.uid(),'budget_amendment_submitted','approved','pending',trim(p_reason));
  return v_id;
end;
$$;

create or replace function public.review_finance_budget_amendment(p_amendment_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_amendment public.finance_budget_amendments%rowtype; v_budget public.finance_budgets%rowtype; v_spent numeric(14,2);
begin
  select * into v_amendment from public.finance_budget_amendments where id = p_amendment_id for update;
  if not found or not public.has_tenant_permission(v_amendment.barangay_id,'finance.approve') then raise exception 'not authorized'; end if;
  if v_amendment.status <> 'pending' then raise exception 'amendment is no longer pending'; end if;
  if v_amendment.requested_by = auth.uid() then raise exception 'amendment requester cannot review it'; end if;
  if not p_approve and length(trim(coalesce(p_note,''))) < 3 then raise exception 'a reason is required to reject an amendment'; end if;
  select * into v_budget from public.finance_budgets where id = v_amendment.budget_id for update;
  if v_budget.status <> 'approved' then raise exception 'budget is no longer approved'; end if;
  if p_approve then
    select coalesce(sum(t.amount),0) into v_spent from public.financial_transactions t
      where t.budget_id = v_budget.id and t.status = 'posted' and t.transaction_type = 'expense';
    if v_amendment.requested_amount < v_spent then raise exception 'amended budget cannot be lower than posted expenses'; end if;
    update public.finance_budgets set amount = v_amendment.requested_amount, updated_at = now() where id = v_budget.id;
  end if;
  update public.finance_budget_amendments set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note),'') where id = v_amendment.id;
  insert into public.financial_events(barangay_id,budget_id,actor_id,action,from_status,to_status,reason)
  values (v_amendment.barangay_id,v_budget.id,auth.uid(),
    case when p_approve then 'budget_amendment_approved' else 'budget_amendment_rejected' end,
    'pending',case when p_approve then 'approved' else 'rejected' end,
    case when p_approve then v_amendment.reason else coalesce(nullif(trim(p_note),''),v_amendment.reason) end);
end;
$$;

alter table public.finance_budget_amendments enable row level security;
create policy finance_budget_amendments_read on public.finance_budget_amendments for select to authenticated
  using (public.has_tenant_permission(barangay_id,'finance.read'));
revoke all on public.finance_budget_amendments from anon, authenticated;
grant select on public.finance_budget_amendments to authenticated;
revoke all on function public.request_finance_budget_amendment(uuid,numeric,text) from public,anon;
revoke all on function public.review_finance_budget_amendment(uuid,boolean,text) from public,anon;
grant execute on function public.request_finance_budget_amendment(uuid,numeric,text) to authenticated;
grant execute on function public.review_finance_budget_amendment(uuid,boolean,text) to authenticated;
