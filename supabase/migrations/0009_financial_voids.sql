-- Corrections to posted entries preserve the original row and append a reasoned void event.
alter table public.financial_transactions add column voided_by uuid references public.profiles(id) on delete restrict;
alter table public.financial_transactions add column voided_at timestamptz;
alter table public.financial_transactions add column void_reason text;
alter table public.financial_transactions drop constraint financial_transactions_status_check;
alter table public.financial_transactions add constraint financial_transactions_status_check
  check (status in ('submitted','posted','rejected','voided'));
alter table public.financial_transactions add constraint financial_transactions_void_fields_check
  check ((status = 'voided') = (voided_by is not null)
    and (status = 'voided') = (voided_at is not null)
    and (status = 'voided') = (void_reason is not null));
alter table public.financial_transactions add constraint financial_transactions_void_reason_check
  check (void_reason is null or length(trim(void_reason)) between 3 and 1000);

alter table public.financial_events drop constraint financial_events_action_check;
alter table public.financial_events add constraint financial_events_action_check
  check (action in ('budget_submitted','budget_approved','transaction_submitted','transaction_posted','transaction_rejected','transaction_voided'));

create or replace function public.void_financial_transaction(p_transaction_id uuid, p_reason text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_transaction public.financial_transactions%rowtype; v_budget public.finance_budgets%rowtype;
begin
  select * into v_transaction from public.financial_transactions where id = p_transaction_id for update;
  if not found or not public.has_tenant_permission(v_transaction.barangay_id, 'finance.approve') then raise exception 'not authorized'; end if;
  if v_transaction.status <> 'posted' then raise exception 'only posted transactions can be voided'; end if;
  if v_transaction.submitted_by = auth.uid() then raise exception 'transaction submitter cannot void it'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'a reason is required to void a transaction'; end if;
  select * into v_budget from public.finance_budgets where id = v_transaction.budget_id for update;
  update public.financial_transactions set status = 'voided', voided_by = auth.uid(), voided_at = now(), void_reason = trim(p_reason)
    where id = p_transaction_id;
  insert into public.financial_events(barangay_id, transaction_id, actor_id, action, from_status, to_status, reason)
  values (v_transaction.barangay_id, p_transaction_id, auth.uid(), 'transaction_voided', 'posted', 'voided', trim(p_reason));
end;
$$;

revoke all on function public.void_financial_transaction(uuid,text) from public, anon;
grant execute on function public.void_financial_transaction(uuid,text) to authenticated;
