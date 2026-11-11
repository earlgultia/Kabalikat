-- Budget amendments must cover the effective posted expense total, including
-- independently approved corrections to posted transactions.
create or replace function public.review_finance_budget_amendment(
  p_amendment_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amendment public.finance_budget_amendments%rowtype;
  v_budget public.finance_budgets%rowtype;
  v_spent numeric(14,2);
begin
  select * into v_amendment
  from public.finance_budget_amendments
  where id = p_amendment_id
  for update;

  if not found or not public.has_tenant_permission(v_amendment.barangay_id, 'finance.approve') then
    raise exception 'not authorized';
  end if;
  if v_amendment.status <> 'pending' then
    raise exception 'amendment is no longer pending';
  end if;
  if v_amendment.requested_by = auth.uid() then
    raise exception 'amendment requester cannot review it';
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'a reason is required to reject an amendment';
  end if;

  select * into v_budget
  from public.finance_budgets
  where id = v_amendment.budget_id
  for update;

  if v_budget.status <> 'approved' then
    raise exception 'budget is no longer approved';
  end if;

  if p_approve then
    select coalesce(sum(t.amount + coalesce(adjustments.total_change, 0)), 0)
      into v_spent
    from public.financial_transactions t
    left join lateral (
      select sum(a.amount_change) as total_change
      from public.financial_adjustments a
      where a.transaction_id = t.id
        and a.status = 'approved'
    ) adjustments on true
    where t.budget_id = v_budget.id
      and t.status = 'posted'
      and t.transaction_type = 'expense';

    if v_amendment.requested_amount < v_spent then
      raise exception 'amended budget cannot be lower than adjusted posted expenses';
    end if;

    update public.finance_budgets
    set amount = v_amendment.requested_amount,
        updated_at = now()
    where id = v_budget.id;
  end if;

  update public.finance_budget_amendments
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(p_note), '')
  where id = v_amendment.id;

  insert into public.financial_events(
    barangay_id, budget_id, actor_id, action, from_status, to_status, reason
  )
  values (
    v_amendment.barangay_id,
    v_budget.id,
    auth.uid(),
    case when p_approve then 'budget_amendment_approved' else 'budget_amendment_rejected' end,
    'pending',
    case when p_approve then 'approved' else 'rejected' end,
    case when p_approve then v_amendment.reason else coalesce(nullif(trim(p_note), ''), v_amendment.reason) end
  );
end;
$$;

revoke all on function public.review_finance_budget_amendment(uuid, boolean, text) from public, anon;
grant execute on function public.review_finance_budget_amendment(uuid, boolean, text) to authenticated;
