-- Support deterministic inbox paging for each authenticated recipient.
create index if not exists community_notifications_inbox_page_idx
  on public.community_notifications(recipient_id, barangay_id, created_at desc, id desc);
