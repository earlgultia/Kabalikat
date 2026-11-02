-- Aggregate-only platform support counts for the support dashboard.
create or replace function public.get_platform_support_queue_summary()
returns table (
  total_count bigint,
  new_count bigint,
  in_progress_count bigint,
  waiting_on_requester_count bigint,
  resolved_count bigint,
  closed_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  return query
  select count(*)::bigint,
    count(*) filter (where ticket.status = 'new')::bigint,
    count(*) filter (where ticket.status = 'in_progress')::bigint,
    count(*) filter (where ticket.status = 'waiting_on_requester')::bigint,
    count(*) filter (where ticket.status = 'resolved')::bigint,
    count(*) filter (where ticket.status = 'closed')::bigint
  from public.support_tickets as ticket;
end;
$$;

revoke all on function public.get_platform_support_queue_summary() from public, anon;
grant execute on function public.get_platform_support_queue_summary() to authenticated;
