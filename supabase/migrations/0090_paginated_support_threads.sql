-- Keep long support conversations and audit histories responsive with stable pages.
create index if not exists support_messages_ticket_page_idx
  on public.support_messages(ticket_id, created_at desc, id desc);

create index if not exists support_ticket_events_ticket_page_idx
  on public.support_ticket_events(ticket_id, created_at desc, id desc);
