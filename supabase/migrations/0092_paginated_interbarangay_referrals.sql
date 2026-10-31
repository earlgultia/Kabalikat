-- Bound referral and per-referral activity reads to the caller's authorized barangay roles.
create index if not exists interbarangay_referrals_activity_page_idx
  on public.interbarangay_referrals(created_at desc, id desc);

create index if not exists interbarangay_referral_events_activity_page_idx
  on public.interbarangay_referral_events(referral_id, created_at desc, id desc);

create or replace function public.list_interbarangay_referral_page(
  p_page integer default 0,
  p_page_size integer default 25
)
returns table (
  id uuid,
  origin_barangay_id uuid,
  origin_name text,
  receiving_barangay_id uuid,
  receiving_name text,
  purpose text,
  disclosure_basis text,
  shared_information text,
  incident_id uuid,
  status text,
  created_at timestamptz,
  acknowledged_at timestamptz,
  responded_at timestamptz,
  response text,
  closed_at timestamptz,
  viewer_side text,
  total_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if not exists (
    select 1 from public.barangay_memberships m
    where m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'not authorized';
  end if;

  return query
  with authorized_rows as (
    select r.id, r.origin_barangay_id, o.name as origin_name,
      r.receiving_barangay_id, d.name as receiving_name, r.purpose,
      r.disclosure_basis, r.shared_information, r.incident_id, r.status,
      r.created_at, r.acknowledged_at, r.responded_at, r.response, r.closed_at,
      case when public.has_tenant_permission(r.origin_barangay_id, 'referrals.create') then 'origin' else 'receiving' end as viewer_side
    from public.interbarangay_referrals r
    join public.barangays o on o.id = r.origin_barangay_id
    join public.barangays d on d.id = r.receiving_barangay_id
    where public.has_tenant_permission(r.origin_barangay_id, 'referrals.create')
       or public.has_tenant_permission(r.receiving_barangay_id, 'referrals.review')
  ), counted as (
    select authorized_rows.*, count(*) over () as total_count
    from authorized_rows
  ), page_rows as (
    select counted.* from counted
    order by counted.created_at desc, counted.id desc
    offset v_page::bigint * v_page_size
    limit v_page_size
  ), audited as (
    insert into public.interbarangay_referral_events(referral_id, actor_id, action)
    select page_rows.id, auth.uid(), case when page_rows.viewer_side = 'origin' then 'origin_viewed' else 'receiving_viewed' end
    from page_rows
    returning referral_id
  )
  select page_rows.id, page_rows.origin_barangay_id, page_rows.origin_name,
    page_rows.receiving_barangay_id, page_rows.receiving_name, page_rows.purpose,
    page_rows.disclosure_basis, page_rows.shared_information, page_rows.incident_id,
    page_rows.status, page_rows.created_at, page_rows.acknowledged_at,
    page_rows.responded_at, page_rows.response, page_rows.closed_at,
    page_rows.viewer_side, page_rows.total_count
  from page_rows;
end;
$$;

create or replace function public.list_interbarangay_referral_activity_page(
  p_referral_id uuid,
  p_page integer default 0,
  p_page_size integer default 25
)
returns table (
  action text,
  actor_name text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if not exists (
    select 1 from public.interbarangay_referrals r
    where r.id = p_referral_id
      and (public.has_tenant_permission(r.origin_barangay_id, 'referrals.create')
        or public.has_tenant_permission(r.receiving_barangay_id, 'referrals.review'))
  ) then
    raise exception 'not authorized';
  end if;

  return query
  with activity_rows as (
    select e.action, coalesce(nullif(p.display_name, ''), 'Barangay member') as actor_name, e.created_at, e.id
    from public.interbarangay_referral_events e
    join public.profiles p on p.id = e.actor_id
    where e.referral_id = p_referral_id
  ), counted as (
    select activity_rows.*, count(*) over () as total_count
    from activity_rows
  )
  select counted.action, counted.actor_name, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_interbarangay_referrals() from authenticated;
revoke all on function public.list_interbarangay_referral_activity() from authenticated;
revoke all on function public.list_interbarangay_referral_page(integer, integer) from public, anon;
revoke all on function public.list_interbarangay_referral_activity_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_interbarangay_referral_page(integer, integer) to authenticated;
grant execute on function public.list_interbarangay_referral_activity_page(uuid, integer, integer) to authenticated;
