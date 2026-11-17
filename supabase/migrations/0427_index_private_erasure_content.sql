-- Account erasure redacts messages and feedback events by their author. These
-- indexes keep those cleanup updates bounded as private conversation history grows.
create index if not exists support_messages_author_idx
  on public.support_messages (author_id);

create index if not exists community_feedback_events_actor_idx
  on public.community_feedback_events (actor_id);
