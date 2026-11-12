-- Avoid broadcasting the public metrics row for heartbeats that do not change
-- any aggregate. Browser polling still refreshes the live count as visitors age
-- out of the two-minute presence window.
-- Identity-level last-seen timestamps duplicated presence data and were not
-- used by analytics, so remove that field and its per-heartbeat write.
alter table public.site_visitor_identities drop column if exists last_seen_at;
alter table public.site_visitor_public_metrics
  add column if not exists today_visitors_day date;

update public.site_visitor_public_metrics metrics
set today_visitors_day = (now() at time zone 'Asia/Manila')::date,
    today_visitors = (
      select count(*)
      from public.site_daily_visitors visitors
      where visitors.visit_day = (now() at time zone 'Asia/Manila')::date
    )
where metrics.singleton;

alter table public.site_visitor_public_metrics
  alter column today_visitors_day set not null;

create or replace function public.track_site_visitor_heartbeat(p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_visitor integer;
  v_new_daily_visitor integer;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_live_visitors bigint;
begin
  if p_visitor_id is null then raise exception 'visitor identifier is required'; end if;

  insert into public.site_visitor_identities(visitor_id, first_seen_at)
  values (p_visitor_id, now()) on conflict (visitor_id) do nothing;
  get diagnostics v_new_visitor = row_count;

  insert into public.site_visitor_presence(visitor_id, last_seen_at)
  values (p_visitor_id, now())
  on conflict (visitor_id) do update set last_seen_at = excluded.last_seen_at;

  insert into public.site_daily_visitors(visitor_id, visit_day)
  values (p_visitor_id, v_today) on conflict do nothing;
  get diagnostics v_new_daily_visitor = row_count;

  select count(*) into v_live_visitors
  from public.site_visitor_presence
  where last_seen_at >= now() - interval '2 minutes';

  update public.site_visitor_public_metrics metrics
  set total_visitors = metrics.total_visitors + v_new_visitor,
      today_visitors = case
        when metrics.today_visitors_day is distinct from v_today then (
          select count(*)
          from public.site_daily_visitors visitors
          where visitors.visit_day = v_today
        )
        else metrics.today_visitors + v_new_daily_visitor
      end,
      today_visitors_day = v_today,
      live_visitors = v_live_visitors,
      updated_at = now()
  where metrics.singleton
    and (
      v_new_visitor > 0
      or metrics.today_visitors_day is distinct from v_today
      or v_new_daily_visitor > 0
      or metrics.live_visitors is distinct from v_live_visitors
    );
end;
$$;
