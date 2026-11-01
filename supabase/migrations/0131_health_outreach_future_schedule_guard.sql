-- Require upcoming schedules for BHW proposals and Captain publication.
create or replace function public.enforce_health_outreach_future_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at <= now() and (
    new.status in ('draft','changes_requested')
    or (tg_op = 'UPDATE' and new.status = 'published' and old.status in ('draft','changes_requested'))
  ) then
    raise exception 'health outreach start time must be in the future';
  end if;
  return new;
end;
$$;

drop trigger if exists health_outreach_future_start_insert_guard on public.health_outreach_campaigns;
drop trigger if exists health_outreach_future_start_update_guard on public.health_outreach_campaigns;
create trigger health_outreach_future_start_insert_guard
  before insert on public.health_outreach_campaigns
  for each row execute function public.enforce_health_outreach_future_start();
create trigger health_outreach_future_start_update_guard
  before update of starts_at,status on public.health_outreach_campaigns
  for each row execute function public.enforce_health_outreach_future_start();

revoke all on function public.enforce_health_outreach_future_start() from public,anon,authenticated;
