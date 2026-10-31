-- Keep feedback history lookups stable and efficient when opened for one item.
create index if not exists community_feedback_events_item_history_page_idx
  on public.community_feedback_events(feedback_id, created_at, id);
