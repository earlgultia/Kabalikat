-- Platform activity is an audit trail: events may be inserted and read, never edited or removed.
create or replace function public.reject_platform_activity_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'platform activity events are append-only';
end;
$$;

revoke all on function public.reject_platform_activity_event_mutation() from public, anon, authenticated;
drop trigger if exists platform_activity_events_append_only on public.platform_activity_events;
create trigger platform_activity_events_append_only
  before update or delete on public.platform_activity_events
  for each row execute function public.reject_platform_activity_event_mutation();
