-- Preserve posted entries and record corrections as independently reviewed linked adjustments.
create table public.financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  transaction_id uuid not null,
  amount_change numeric(14,2) not null check (amount_change <> 0),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  foreign key (transaction_id, barangay_id) references public.financial_transactions(id, barangay_id) on delete restrict,
  check ((status = 'pending') = (reviewed_by is null)),
  check ((status = 'pending') = (reviewed_at is null)),
  check (review_note is null or length(review_note) <= 1000)
);
create index financial_adjustments_transaction_idx on public.financial_adjustments(transaction_id, created_at desc);
create unique index financial_adjustments_one_pending_idx on public.financial_adjustments(transaction_id) where status = 'pending';

create or replace function public.request_financial_adjustment(p_transaction_id uuid,p_amount_change numeric,p_reason text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_tx public.financial_transactions%rowtype; v_effective numeric(14,2); v_id uuid;
begin
  select * into v_tx from public.financial_transactions where id = p_transaction_id for update;
  if not found or not public.has_tenant_permission(v_tx.barangay_id,'finance.manage') then raise exception 'not authorized'; end if;
  if v_tx.status <> 'posted' then raise exception 'only posted entries can be adjusted'; end if;
  if p_amount_change is null or p_amount_change = 0 or p_amount_change <> round(p_amount_change,2)
    or abs(p_amount_change) > 999999999999.99 or length(trim(coalesce(p_reason,''))) not between 3 and 1000 then
    raise exception 'invalid financial adjustment';
  end if;
  select v_tx.amount + coalesce(sum(a.amount_change),0) into v_effective from public.financial_adjustments a
    where a.transaction_id = v_tx.id and a.status = 'approved';
  if v_effective + p_amount_change <= 0 then raise exception 'adjusted amount must remain positive'; end if;
  if exists (select 1 from public.financial_adjustments a where a.transaction_id = v_tx.id and a.status = 'pending') then
    raise exception 'this entry already has a pending adjustment';
  end if;
  if v_tx.transaction_type = 'expense' then
    perform 1 from public.finance_budgets where id = v_tx.budget_id for update;
  end if;
  insert into public.financial_adjustments(barangay_id,transaction_id,amount_change,reason,requested_by)
  values (v_tx.barangay_id,v_tx.id,p_amount_change,trim(p_reason),auth.uid()) returning id into v_id;
  insert into public.financial_events(barangay_id,transaction_id,actor_id,action,from_status,to_status,reason)
  values (v_tx.barangay_id,v_tx.id,auth.uid(),'adjustment_submitted','posted','pending',trim(p_reason));
  return v_id;
end;
$$;

create or replace function public.review_financial_adjustment(p_adjustment_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_adjustment public.financial_adjustments%rowtype; v_tx public.financial_transactions%rowtype;
  v_budget public.finance_budgets%rowtype; v_current_amount numeric(14,2); v_posted_after numeric(14,2);
begin
  select * into v_adjustment from public.financial_adjustments where id = p_adjustment_id for update;
  if not found or not public.has_tenant_permission(v_adjustment.barangay_id,'finance.approve') then raise exception 'not authorized'; end if;
  if v_adjustment.status <> 'pending' then raise exception 'adjustment is no longer pending'; end if;
  if v_adjustment.requested_by = auth.uid() then raise exception 'adjustment requester cannot review it'; end if;
  if not p_approve and length(trim(coalesce(p_note,''))) < 3 then raise exception 'a rejection reason is required'; end if;
  select * into v_tx from public.financial_transactions where id = v_adjustment.transaction_id for update;
  if v_tx.status <> 'posted' then raise exception 'original entry is no longer posted'; end if;
  select v_tx.amount + coalesce(sum(a.amount_change),0) into v_current_amount from public.financial_adjustments a
    where a.transaction_id = v_tx.id and a.status = 'approved';
  if p_approve and v_current_amount + v_adjustment.amount_change <= 0 then raise exception 'adjusted amount must remain positive'; end if;
  if p_approve and v_tx.transaction_type = 'expense' then
    select * into v_budget from public.finance_budgets where id = v_tx.budget_id for update;
    select coalesce(sum(t.amount + coalesce(adjusted.total_change,0)),0) into v_posted_after
      from public.financial_transactions t
      left join lateral (select sum(a.amount_change) as total_change from public.financial_adjustments a
        where a.transaction_id = t.id and a.status = 'approved') adjusted on true
      where t.budget_id = v_tx.budget_id and t.status = 'posted' and t.transaction_type = 'expense';
    if v_posted_after + v_adjustment.amount_change > v_budget.amount then raise exception 'adjustment would exceed the approved budget'; end if;
  end if;
  update public.financial_adjustments set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note),'') where id = v_adjustment.id;
  insert into public.financial_events(barangay_id,transaction_id,actor_id,action,from_status,to_status,reason)
  values (v_adjustment.barangay_id,v_tx.id,auth.uid(),case when p_approve then 'adjustment_approved' else 'adjustment_rejected' end,
    'pending',case when p_approve then 'approved' else 'rejected' end,
    case when p_approve then v_adjustment.reason else coalesce(nullif(trim(p_note),''),v_adjustment.reason) end);
end;
$$;

create or replace function public.enforce_adjusted_expense_limit()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_budget public.finance_budgets%rowtype; v_spent numeric(14,2); v_posted_after numeric(14,2);
begin
  if new.status = 'posted' and (tg_op = 'INSERT' or old.status is distinct from new.status)
    and new.transaction_type = 'expense' then
    select * into v_budget from public.finance_budgets where id = new.budget_id for update;
    select coalesce(sum(t.amount + coalesce(adjusted.total_change,0)),0) into v_posted_after
      from public.financial_transactions t
      left join lateral (select sum(a.amount_change) as total_change from public.financial_adjustments a
        where a.transaction_id = t.id and a.status = 'approved') adjusted on true
      where t.budget_id = new.budget_id and t.status = 'posted' and t.transaction_type = 'expense'
        and t.id <> new.id;
    select new.amount + coalesce(sum(a.amount_change),0) into v_spent from public.financial_adjustments a
      where a.transaction_id = new.id and a.status = 'approved';
    if v_spent + v_posted_after > v_budget.amount then
      raise exception 'expense exceeds the approved budget after adjustments';
    end if;
  end if;
  return new;
end;
$$;
create trigger financial_transactions_adjusted_expense_limit before update of status on public.financial_transactions
  for each row execute function public.enforce_adjusted_expense_limit();

alter table public.financial_events drop constraint financial_events_action_check;
alter table public.financial_events add constraint financial_events_action_check check (action in (
  'budget_submitted','budget_approved','transaction_submitted','transaction_posted','transaction_rejected',
  'transaction_voided','receipt_attached','budget_amendment_submitted','budget_amendment_approved','budget_amendment_rejected',
  'adjustment_submitted','adjustment_approved','adjustment_rejected'
));

alter table public.financial_adjustments enable row level security;
create policy financial_adjustments_read on public.financial_adjustments for select to authenticated
  using (public.has_tenant_permission(barangay_id,'finance.read'));
revoke all on public.financial_adjustments from anon,authenticated;
grant select on public.financial_adjustments to authenticated;
revoke all on function public.request_financial_adjustment(uuid,numeric,text) from public,anon;
revoke all on function public.review_financial_adjustment(uuid,boolean,text) from public,anon;
grant execute on function public.request_financial_adjustment(uuid,numeric,text) to authenticated;
grant execute on function public.review_financial_adjustment(uuid,boolean,text) to authenticated;
revoke all on function public.enforce_adjusted_expense_limit() from public,anon,authenticated;
