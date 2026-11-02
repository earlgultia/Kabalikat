-- Let a requester reopen a resolved request with a recorded explanation.
-- Closed requests remain terminal; platform administrators already control status.
create or replace function public.reopen_own_resolved_support_ticket(
  p_ticket_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.support_tickets%rowtype;
  v_message text := trim(coalesce(p_message, ''));
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if length(v_message) not between 3 and 4000 then
    raise exception 'explanation must be 3 to 4000 characters';
  end if;

  select * into v_ticket
  from public.support_tickets
  where id = p_ticket_id
  for update;

  if not found
    or v_ticket.requester_id <> auth.uid()
    or not public.is_active_member(v_ticket.barangay_id) then
    raise exception 'not authorized';
  end if;
  if v_ticket.status <> 'resolved' then
    raise exception 'only resolved requests can be reopened';
  end if;

  update public.support_tickets
  set status = 'in_progress', updated_at = now()
  where id = v_ticket.id;

  insert into public.support_messages(ticket_id, author_id, visibility, body)
  values (v_ticket.id, auth.uid(), 'requester', v_message);

  insert into public.support_ticket_events(ticket_id, actor_id, action, from_status, to_status)
  values (v_ticket.id, auth.uid(), 'status_changed', 'resolved', 'in_progress');
end;
$$;

revoke all on function public.reopen_own_resolved_support_ticket(uuid, text) from public, anon;
grant execute on function public.reopen_own_resolved_support_ticket(uuid, text) to authenticated;
