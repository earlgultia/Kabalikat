-- Keep the Super Admin Captain account directory independent from row
-- aggregation over auth.users and make its search/pagination predictable.
create or replace function public.list_platform_captain_accounts(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null
)
returns table (
  user_id uuid,
  display_name text,
  email text,
  barangays text,
  membership_count bigint,
  active_membership_count bigint,
  removal_started_at timestamptz,
  removal_completed_at timestamptz,
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
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  return query
  with captain_memberships as (
    select membership.id,
      membership.user_id,
      membership.status::text as membership_status,
      barangay.name || ' (' || barangay.code || ')' as barangay_label
    from public.barangay_memberships membership
    join public.role_definitions role
      on role.id = membership.role_id and role.key = 'captain'
    join public.barangays barangay on barangay.id = membership.barangay_id
    where membership.status in ('active', 'suspended')
  ), accounts as (
    select captain.user_id,
      coalesce(nullif(trim(profile.display_name), ''), 'Barangay Captain') as account_name,
      coalesce(auth_user.email::text, '') as account_email,
      coalesce((
        select string_agg(distinct cm.barangay_label, ', ' order by cm.barangay_label)
        from captain_memberships cm
        where cm.user_id = captain.user_id
      ), '') as account_barangays,
      (select count(*) from captain_memberships cm where cm.user_id = captain.user_id) as membership_count,
      (select count(*) from captain_memberships cm
        where cm.user_id = captain.user_id and cm.membership_status = 'active') as active_membership_count,
      removal.created_at as removal_started_at,
      removal.completed_at as removal_completed_at
    from (select distinct user_id from captain_memberships) captain
    join public.profiles profile on profile.id = captain.user_id
    join auth.users auth_user on auth_user.id = captain.user_id
    left join public.platform_account_removal_events removal
      on removal.target_user_id = captain.user_id
    where not exists (
      select 1 from public.platform_administrators administrator
      where administrator.user_id = captain.user_id
    )
      and removal.completed_at is null
  ), filtered as (
    select *
    from accounts
    where v_search is null
      or position(lower(v_search) in lower(concat_ws(' ', account_name, account_email, account_barangays))) > 0
  ), counted as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
  select counted.user_id, counted.account_name, counted.account_email, counted.account_barangays,
    counted.membership_count, counted.active_membership_count, counted.removal_started_at,
    counted.removal_completed_at, counted.total_count
  from counted
  order by counted.account_name, counted.account_email, counted.user_id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_platform_captain_accounts(integer, integer, text) from public, anon;
grant execute on function public.list_platform_captain_accounts(integer, integer, text) to authenticated;
