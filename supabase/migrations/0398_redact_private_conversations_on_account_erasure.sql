-- Private conversations can contain personal details even when the deleted
-- account was not the author of every reply. Keep their audit rows but redact
-- the conversation text associated with the account's own support/feedback.
create or replace function public.redact_private_conversations_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_messages message
  set body = '[Message removed after account deletion]'
  where message.author_id = old.id
     or message.ticket_id in (
       select ticket.id from public.support_tickets ticket where ticket.requester_id = old.id
     );

  update public.community_feedback_events feedback_event
  set note = '[Note removed after account deletion]'
  where feedback_event.actor_id = old.id
     or feedback_event.feedback_id in (
       select feedback.id from public.community_feedback feedback where feedback.submitted_by = old.id
     );

  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

revoke all on function public.redact_private_conversations_before_auth_deletion() from public, anon, authenticated;

drop trigger if exists on_auth_user_private_conversation_redaction on auth.users;
create trigger on_auth_user_private_conversation_redaction
  before delete on auth.users
  for each row execute function public.redact_private_conversations_before_auth_deletion();

drop trigger if exists on_auth_user_private_conversation_soft_redaction on auth.users;
create trigger on_auth_user_private_conversation_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_private_conversations_before_auth_deletion();
