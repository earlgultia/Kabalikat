-- Support the LGU's own subscription request history, which is scoped to one
-- municipality and displayed newest first.
create index if not exists lgu_subscription_plan_requests_lgu_history_idx
  on public.lgu_subscription_plan_requests (lgu_id, created_at desc, id desc);
