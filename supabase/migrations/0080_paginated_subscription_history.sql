-- Support deterministic paging through a subscription's complete admin audit history.
create index if not exists subscription_events_history_page_idx
  on public.subscription_events(subscription_id, created_at desc, id desc);
