-- Use the same effective expense total as budget usage and adjustment reviews
-- when deciding whether a submitted expense fits under its approved budget.
create or replace function public.review_financial_transaction(
  p_transaction_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.financial_transactions%rowtype;
  v_budget public.finance_budgets%rowtype;
  v_spent numeric(14,2);
begin
  select * into v_transaction
  from public.financial_transactions
  where id = p_transaction_id
  for update;

  if not found or not public.has_tenant_permission(v_transaction.barangay_id, 'finance.approve') then
    raise exception 'not authorized';
  end if;
  if v_transaction.status <> 'submitted' then
    raise exception 'transaction is not awaiting review';
  end if;
  if v_transaction.submitted_by = auth.uid() then
    raise exception 'transaction submitter cannot review it';
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'a reason is required to reject a transaction';
  end if;

  select * into v_budget
  from public.finance_budgets
  where id = v_transaction.budget_id
  for update;

  if p_approve and v_transaction.transaction_type = 'expense' then
    select coalesce(sum(t.amount + coalesce(adjustments.total_change, 0)), 0)
      into v_spent
    from public.financial_transactions t
    left join lateral (
      select sum(a.amount_change) as total_change
      from public.financial_adjustments a
      where a.transaction_id = t.id
        and a.barangay_id = t.barangay_id
        and a.status = 'approved'
    ) adjustments on true
    where t.budget_id = v_budget.id
      and t.status = 'posted'
      and t.transaction_type = 'expense';

    if v_spent + v_transaction.amount > v_budget.amount then
      raise exception 'expense exceeds the approved budget after adjustments';
    end if;
  end if;

  update public.financial_transactions
  set status = case when p_approve then 'posted' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(p_note), '')
  where id = p_transaction_id;

  insert into public.financial_events(
    barangay_id, transaction_id, actor_id, action, from_status, to_status, reason
  )
  values (
    v_transaction.barangay_id,
    p_transaction_id,
    auth.uid(),
    case when p_approve then 'transaction_posted' else 'transaction_rejected' end,
    'submitted',
    case when p_approve then 'posted' else 'rejected' end,
    nullif(trim(p_note), '')
  );
end;
$$;

revoke all on function public.review_financial_transaction(uuid, boolean, text) from public, anon;
grant execute on function public.review_financial_transaction(uuid, boolean, text) to authenticated;
