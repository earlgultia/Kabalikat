-- Keep an activity event's actor attribution stable after it is recorded.
create or replace function public.prevent_platform_activity_actor_name_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_name is distinct from old.actor_name then
    raise exception 'platform activity actor name is immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_platform_activity_actor_name_change() from public, anon, authenticated;
drop trigger if exists platform_activity_actor_name_immutable on public.platform_activity_events;
create trigger platform_activity_actor_name_immutable
  before update of actor_name on public.platform_activity_events
  for each row execute function public.prevent_platform_activity_actor_name_change();
