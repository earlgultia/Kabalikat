-- Aggregate-only public visitor metrics; visitor identifiers and daily detail
-- remain inaccessible to browser roles and are not associated with tenants.
create table public.site_visitor_identities (
  visitor_id uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.site_visitor_presence (
  visitor_id uuid primary key references public.site_visitor_identities(visitor_id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index site_visitor_presence_last_seen_idx on public.site_visitor_presence(last_seen_at);

create table public.site_daily_visitors (
  visitor_id uuid not null references public.site_visitor_identities(visitor_id) on delete cascade,
  visit_day date not null,
  primary key (visitor_id, visit_day)
);
create index site_daily_visitors_day_idx on public.site_daily_visitors(visit_day);

create table public.site_daily_page_views (
  visitor_id uuid not null references public.site_visitor_identities(visitor_id) on delete cascade,
  visit_day date not null,
  page_key text not null check (page_key in ('home', 'features', 'plans', 'how-it-works', 'privacy')),
  view_count bigint not null default 1 check (view_count > 0),
  primary key (visitor_id, visit_day, page_key)
);
create index site_daily_page_views_day_idx on public.site_daily_page_views(visit_day, page_key);

create table public.site_visitor_public_metrics (
  singleton boolean primary key default true check (singleton),
  total_visitors bigint not null default 0,
  today_visitors bigint not null default 0,
  total_page_views bigint not null default 0,
  live_visitors bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.site_visitor_public_metrics(singleton) values (true);

alter table public.site_visitor_identities enable row level security;
alter table public.site_visitor_presence enable row level security;
alter table public.site_daily_visitors enable row level security;
alter table public.site_daily_page_views enable row level security;
alter table public.site_visitor_public_metrics enable row level security;

create policy site_visitor_public_metrics_read on public.site_visitor_public_metrics
  for select to anon, authenticated using (singleton);
grant select on public.site_visitor_public_metrics to anon, authenticated;
revoke all on public.site_visitor_identities, public.site_visitor_presence,
  public.site_daily_visitors, public.site_daily_page_views from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.site_visitor_public_metrics from public, anon, authenticated;

create or replace function public.track_site_visitor_heartbeat(p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_visitor integer;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if p_visitor_id is null then raise exception 'visitor identifier is required'; end if;

  insert into public.site_visitor_identities(visitor_id, first_seen_at, last_seen_at)
  values (p_visitor_id, now(), now()) on conflict (visitor_id) do nothing;
  get diagnostics v_new_visitor = row_count;

  insert into public.site_visitor_identities(visitor_id, last_seen_at)
  values (p_visitor_id, now())
  on conflict (visitor_id) do update set last_seen_at = excluded.last_seen_at;
  insert into public.site_visitor_presence(visitor_id, last_seen_at)
  values (p_visitor_id, now())
  on conflict (visitor_id) do update set last_seen_at = excluded.last_seen_at;

  insert into public.site_daily_visitors(visitor_id, visit_day)
  values (p_visitor_id, v_today) on conflict do nothing;

  update public.site_visitor_public_metrics
  set total_visitors = total_visitors + v_new_visitor,
      today_visitors = (select count(*) from public.site_daily_visitors where visit_day = v_today),
      live_visitors = (select count(*) from public.site_visitor_presence where last_seen_at >= now() - interval '2 minutes'),
      updated_at = now()
  where singleton;
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
begin
  if p_page_key not in ('home', 'features', 'plans', 'how-it-works', 'privacy') then
    raise exception 'invalid public page key';
  end if;
  perform public.track_site_visitor_heartbeat(p_visitor_id);
  insert into public.site_daily_page_views(visitor_id, visit_day, page_key, view_count)
  values (p_visitor_id, v_today, p_page_key, 1)
  on conflict (visitor_id, visit_day, page_key)
  do update set view_count = public.site_daily_page_views.view_count + 1;
  update public.site_visitor_public_metrics
  set total_page_views = total_page_views + 1, updated_at = now()
  where singleton;
end;
$$;

create or replace function public.get_public_site_visitor_metrics()
returns table(total_visitors bigint, today_visitors bigint, total_page_views bigint, live_visitors bigint, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.total_visitors,
    (select count(*) from public.site_daily_visitors where visit_day = (now() at time zone 'Asia/Manila')::date),
    m.total_page_views,
    (select count(*) from public.site_visitor_presence where last_seen_at >= now() - interval '2 minutes'),
    m.updated_at
  from public.site_visitor_public_metrics m where m.singleton;
$$;

create or replace function public.get_platform_site_visitor_analytics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  with daily as (
    select d::date as period_start,
      (select count(*) from public.site_daily_visitors v where v.visit_day = d::date) as visitors,
      (select coalesce(sum(p.view_count), 0) from public.site_daily_page_views p where p.visit_day = d::date) as page_views
    from generate_series((now() at time zone 'Asia/Manila')::date - 29, (now() at time zone 'Asia/Manila')::date, interval '1 day') d
  ), weekly as (
    select date_trunc('week', d::timestamp)::date as period_start,
      (select count(*) from public.site_daily_visitors v where v.visit_day >= date_trunc('week', d::timestamp)::date and v.visit_day < date_trunc('week', d::timestamp)::date + 7) as visitors,
      (select coalesce(sum(p.view_count), 0) from public.site_daily_page_views p where p.visit_day >= date_trunc('week', d::timestamp)::date and p.visit_day < date_trunc('week', d::timestamp)::date + 7) as page_views
    from generate_series(date_trunc('week', (now() at time zone 'Asia/Manila')::date - 77)::date, date_trunc('week', (now() at time zone 'Asia/Manila')::date)::date, interval '7 days') d
  ), monthly as (
    select date_trunc('month', d)::date as period_start,
      (select count(*) from public.site_daily_visitors v where v.visit_day >= date_trunc('month', d)::date and v.visit_day < (date_trunc('month', d) + interval '1 month')::date) as visitors,
      (select coalesce(sum(p.view_count), 0) from public.site_daily_page_views p where p.visit_day >= date_trunc('month', d)::date and p.visit_day < (date_trunc('month', d) + interval '1 month')::date) as page_views
    from generate_series(date_trunc('month', (now() at time zone 'Asia/Manila') - interval '11 months'), date_trunc('month', (now() at time zone 'Asia/Manila')), interval '1 month') d
  ), top_pages as (
    select page_key, coalesce(sum(view_count), 0)::bigint as page_views,
      count(distinct visitor_id)::bigint as unique_visitors
    from public.site_daily_page_views group by page_key
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object('total_visitors', m.total_visitors, 'today_visitors', m.today_visitors, 'total_page_views', m.total_page_views, 'live_visitors', m.live_visitors)
      from public.get_public_site_visitor_metrics() m),
    'daily', (select coalesce(jsonb_agg(to_jsonb(x) order by x.period_start), '[]'::jsonb) from daily x),
    'weekly', (select coalesce(jsonb_agg(to_jsonb(x) order by x.period_start), '[]'::jsonb) from weekly x),
    'monthly', (select coalesce(jsonb_agg(to_jsonb(x) order by x.period_start), '[]'::jsonb) from monthly x),
    'top_pages', (select coalesce(jsonb_agg(to_jsonb(x) order by x.page_views desc, x.page_key), '[]'::jsonb) from top_pages x)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.track_site_visitor_heartbeat(uuid) from public, authenticated;
revoke all on function public.track_site_page_view(uuid, text) from public, authenticated;
revoke all on function public.get_public_site_visitor_metrics() from public;
revoke all on function public.get_platform_site_visitor_analytics() from public, anon;
grant execute on function public.track_site_visitor_heartbeat(uuid) to anon;
grant execute on function public.track_site_page_view(uuid, text) to anon;
grant execute on function public.get_public_site_visitor_metrics() to anon, authenticated;
grant execute on function public.get_platform_site_visitor_analytics() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.site_visitor_public_metrics;
exception when duplicate_object then null;
end $$;
