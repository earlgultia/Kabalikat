-- Keep anonymous analytics writes away from one shared counter row. Traffic
-- is spread across counter shards, while readers refresh one cached snapshot
-- and count active visitors at most once every 30 seconds.
alter table public.site_visitor_public_metrics
  add column if not exists live_metrics_refreshed_at timestamptz not null
    default '-infinity'::timestamptz;

create table if not exists public.site_visitor_counter_shards (
  shard smallint primary key check (shard between 0 and 31),
  total_visitors bigint not null default 0,
  today_visitors bigint not null default 0,
  today_visitors_day date not null,
  total_page_views bigint not null default 0
);
alter table public.site_visitor_counter_shards enable row level security;
revoke all on public.site_visitor_counter_shards from public, anon, authenticated;

insert into public.site_visitor_counter_shards(
  shard, total_visitors, today_visitors, today_visitors_day, total_page_views
)
select shard::smallint,
  case when shard = 0 then metrics.total_visitors else 0 end,
  case when shard = 0 and metrics.today_visitors_day = (now() at time zone 'Asia/Manila')::date
    then metrics.today_visitors else 0 end,
  (now() at time zone 'Asia/Manila')::date,
  case when shard = 0 then metrics.total_page_views else 0 end
from generate_series(0, 31) shard
cross join public.site_visitor_public_metrics metrics
where metrics.singleton
on conflict (shard) do nothing;

create or replace function public.track_site_visitor_heartbeat(p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_visitor integer;
  v_new_daily_visitor integer;
  v_shard smallint;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if p_visitor_id is null then raise exception 'visitor identifier is required'; end if;

  insert into public.site_visitor_identities(visitor_id, first_seen_at)
  values (p_visitor_id, now()) on conflict (visitor_id) do nothing;
  get diagnostics v_new_visitor = row_count;
  v_shard := mod((pg_catalog.hashtextextended(p_visitor_id::text, 0) & 9223372036854775807), 32)::smallint;

  insert into public.site_visitor_presence(visitor_id, last_seen_at)
  values (p_visitor_id, now())
  on conflict (visitor_id) do update set last_seen_at = excluded.last_seen_at;

  insert into public.site_daily_visitors(visitor_id, visit_day)
  values (p_visitor_id, v_today) on conflict do nothing;
  get diagnostics v_new_daily_visitor = row_count;

  if v_new_visitor > 0 or v_new_daily_visitor > 0 then
    insert into public.site_visitor_counter_shards as counters(
      shard, total_visitors, today_visitors, today_visitors_day
    ) values (v_shard, v_new_visitor, v_new_daily_visitor, v_today)
    on conflict (shard) do update
    set total_visitors = counters.total_visitors + excluded.total_visitors,
        today_visitors = case
          when counters.today_visitors_day = excluded.today_visitors_day
            then counters.today_visitors + excluded.today_visitors
          else excluded.today_visitors
        end,
        today_visitors_day = excluded.today_visitors_day;
  end if;
end;
$$;

create or replace function public.track_site_page_view(p_visitor_id uuid, p_page_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_shard smallint;
begin
  if p_page_key not in ('home', 'features', 'plans', 'how-it-works', 'privacy') then
    raise exception 'invalid public page key';
  end if;
  perform public.track_site_visitor_heartbeat(p_visitor_id);
  insert into public.site_daily_page_views(visitor_id, visit_day, page_key, view_count)
  values (p_visitor_id, v_today, p_page_key, 1)
  on conflict (visitor_id, visit_day, page_key)
  do update set view_count = public.site_daily_page_views.view_count + 1;

  v_shard := mod((pg_catalog.hashtextextended(p_visitor_id::text, 0) & 9223372036854775807), 32)::smallint;
  update public.site_visitor_counter_shards
  set total_page_views = total_page_views + 1
  where shard = v_shard;
end;
$$;

create or replace function public.get_public_site_visitor_metrics()
returns table(
  total_visitors bigint,
  today_visitors bigint,
  total_page_views bigint,
  live_visitors bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_last_refresh timestamptz;
  v_live_visitors bigint;
  v_total_visitors bigint;
  v_today_visitors bigint;
  v_total_page_views bigint;
begin
  select metrics.live_metrics_refreshed_at into v_last_refresh
  from public.site_visitor_public_metrics metrics where metrics.singleton;

  if v_last_refresh < v_now - interval '30 seconds'
    and pg_catalog.pg_try_advisory_xact_lock(1030512301, 1) then
    select metrics.live_metrics_refreshed_at into v_last_refresh
    from public.site_visitor_public_metrics metrics
    where metrics.singleton
    for update;

    v_now := clock_timestamp();
    if v_last_refresh < v_now - interval '30 seconds' then
      select count(*) into v_live_visitors
      from public.site_visitor_presence presence
      where presence.last_seen_at >= v_now - interval '2 minutes';

      select coalesce(sum(shard.total_visitors), 0),
          coalesce(sum(shard.today_visitors) filter (where shard.today_visitors_day = v_today), 0),
          coalesce(sum(shard.total_page_views), 0)
      into v_total_visitors, v_today_visitors, v_total_page_views
      from public.site_visitor_counter_shards shard;

      update public.site_visitor_public_metrics metrics
      set total_visitors = v_total_visitors,
          today_visitors = v_today_visitors,
          total_page_views = v_total_page_views,
          live_visitors = v_live_visitors,
          today_visitors_day = v_today,
          live_metrics_refreshed_at = v_now,
          updated_at = case when metrics.total_visitors is distinct from v_total_visitors
              or metrics.today_visitors is distinct from v_today_visitors
              or metrics.total_page_views is distinct from v_total_page_views
              or metrics.live_visitors is distinct from v_live_visitors
              or metrics.today_visitors_day is distinct from v_today
            then v_now else metrics.updated_at end
      where metrics.singleton;
    end if;
  end if;

  return query
  select metrics.total_visitors, metrics.today_visitors,
    metrics.total_page_views, metrics.live_visitors, metrics.updated_at
  from public.site_visitor_public_metrics metrics
  where metrics.singleton;
end;
$$;

revoke all on function public.track_site_visitor_heartbeat(uuid) from public, authenticated;
grant execute on function public.track_site_visitor_heartbeat(uuid) to anon;
revoke all on function public.track_site_page_view(uuid, text) from public, authenticated;
grant execute on function public.track_site_page_view(uuid, text) to anon;
revoke all on function public.get_public_site_visitor_metrics() from public;
grant execute on function public.get_public_site_visitor_metrics() to anon, authenticated;
