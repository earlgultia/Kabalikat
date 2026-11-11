-- Let the Secretary dashboard open one queue containing both referral states
-- that require a receiving barangay response.
create or replace function public.search_interbarangay_referral_page(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_status text default 'all'
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
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_status text := coalesce(nullif(trim(p_status), ''), 'all');
begin
  if not exists (
    select 1 from public.barangay_memberships membership
    where membership.user_id = (select auth.uid()) and membership.status = 'active'
  ) then
    raise exception 'not authorized';
  end if;
  if v_status not in ('all', 'submitted', 'acknowledged', 'responded', 'declined', 'closed', 'needs_action') then
    raise exception 'invalid referral status';
  end if;
  if length(coalesce(v_search, '')) > 100 then
    raise exception 'search text is too long';
  end if;

  return query
  with authorized_rows as (
    select r.id, r.origin_barangay_id, origin.name as origin_name,
      r.receiving_barangay_id, receiving.name as receiving_name, r.purpose,
      r.disclosure_basis, r.shared_information, r.incident_id, r.status,
      r.created_at, r.acknowledged_at, r.responded_at, r.response, r.closed_at,
      case when public.has_tenant_permission(r.origin_barangay_id, 'referrals.create')
        then 'origin' else 'receiving' end as viewer_side
    from public.interbarangay_referrals r
    join public.barangays origin on origin.id = r.origin_barangay_id
    join public.barangays receiving on receiving.id = r.receiving_barangay_id
    where (public.has_tenant_permission(r.origin_barangay_id, 'referrals.create')
        or public.has_tenant_permission(r.receiving_barangay_id, 'referrals.review'))
      and (
        v_status = 'all'
        or (v_status = 'needs_action'
          and r.status in ('submitted', 'acknowledged')
          and public.has_tenant_permission(r.receiving_barangay_id, 'referrals.review'))
        or r.status = v_status
      )
      and (v_search is null
        or r.purpose ilike '%' || v_search || '%'
        or origin.name ilike '%' || v_search || '%'
        or receiving.name ilike '%' || v_search || '%'
        or r.response ilike '%' || v_search || '%')
  ), counted as (
    select authorized_rows.*, count(*) over () as total_count from authorized_rows
  ), page_rows as (
    select counted.* from counted
    order by counted.created_at desc, counted.id desc
    offset v_page::bigint * v_page_size
    limit v_page_size
  ), audited as (
    insert into public.interbarangay_referral_events(referral_id, actor_id, action)
    select page_rows.id, (select auth.uid()),
      case when page_rows.viewer_side = 'origin' then 'origin_viewed' else 'receiving_viewed' end
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

revoke all on function public.search_interbarangay_referral_page(integer, integer, text, text) from public, anon;
grant execute on function public.search_interbarangay_referral_page(integer, integer, text, text) to authenticated;
