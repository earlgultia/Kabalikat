-- Keep new and returned SK proposals publishable by requiring a future start.
create or replace function public.enforce_sk_event_future_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at <= now() and (
    new.status in ('draft','changes_requested')
    or (tg_op = 'UPDATE' and new.status = 'published' and old.status in ('draft','changes_requested'))
  ) then
    raise exception 'SK event start time must be in the future';
  end if;
  return new;
end;
$$;

drop trigger if exists sk_event_future_start_insert_guard on public.sk_events;
drop trigger if exists sk_event_future_start_update_guard on public.sk_events;
create trigger sk_event_future_start_insert_guard
  before insert on public.sk_events
  for each row execute function public.enforce_sk_event_future_start();
create trigger sk_event_future_start_update_guard
  before update of starts_at,status on public.sk_events
  for each row execute function public.enforce_sk_event_future_start();

revoke all on function public.enforce_sk_event_future_start() from public,anon,authenticated;
