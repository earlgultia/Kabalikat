-- Retire Captain Auth accounts without breaking foreign keys or erasing records.
create table public.platform_account_removal_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  target_name text not null,
  target_email text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (target_user_id)
);

alter table public.platform_account_removal_events enable row level security;
create policy platform_account_removal_events_admin_read
  on public.platform_account_removal_events for select to authenticated
  using (public.is_platform_administrator());
revoke all on public.platform_account_removal_events from anon, authenticated;
grant select on public.platform_account_removal_events to authenticated;

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
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;

  return query
  with accounts as (
    select membership.user_id,
      coalesce(nullif(trim(profile.display_name), ''), 'Barangay Captain') as account_name,
      coalesce(auth_user.email::text, '') as account_email,
      string_agg(distinct barangay.name || ' (' || barangay.code || ')', ', ' order by barangay.name || ' (' || barangay.code || ')') as barangays,
      count(distinct membership.id) as membership_count,
      count(distinct membership.id) filter (where membership.status = 'active') as active_membership_count,
      removal.created_at as removal_started_at,
      removal.completed_at as removal_completed_at
    from public.barangay_memberships membership
    join public.role_definitions role on role.id = membership.role_id and role.key = 'captain'
    join public.profiles profile on profile.id = membership.user_id
    join auth.users auth_user on auth_user.id = membership.user_id
    join public.barangays barangay on barangay.id = membership.barangay_id
    left join public.platform_account_removal_events removal on removal.target_user_id = membership.user_id
    where membership.status in ('active', 'suspended')
      and not exists (select 1 from public.platform_administrators admin where admin.user_id = membership.user_id)
      and removal.completed_at is null
    group by membership.user_id, profile.display_name, auth_user.email, removal.created_at, removal.completed_at
  ), filtered as (
    select * from accounts
    where v_search is null or position(lower(v_search) in lower(concat_ws(' ', account_name, account_email, barangays))) > 0
  ), counted as (
    select filtered.*, count(*) over () as total_count from filtered
  )
  select counted.user_id, counted.account_name, counted.account_email, counted.barangays,
    counted.membership_count, counted.active_membership_count, counted.removal_started_at,
    counted.removal_completed_at, counted.total_count
  from counted
  order by counted.account_name, counted.account_email, counted.user_id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

create or replace function public.prepare_platform_captain_account_removal(
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_email text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if length(v_reason) not between 3 and 1000 then raise exception 'provide a reason for removing this Captain account'; end if;
  if exists (select 1 from public.platform_administrators where user_id = p_user_id) then
    raise exception 'platform administrator accounts cannot be removed here';
  end if;
  if exists (select 1 from public.platform_account_removal_events where target_user_id = p_user_id) then
    return;
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), 'Barangay Captain'), coalesce(auth_user.email::text, '')
    into v_name, v_email
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.id = p_user_id;
  if not found then raise exception 'Captain account was not found'; end if;
  if not exists (
    select 1 from public.barangay_memberships membership
    join public.role_definitions role on role.id = membership.role_id and role.key = 'captain'
    where membership.user_id = p_user_id and membership.status in ('active', 'suspended')
  ) then raise exception 'account is not an active or suspended Captain'; end if;

  insert into public.platform_account_removal_events(target_user_id, actor_id, target_name, target_email, reason)
  values (p_user_id, (select auth.uid()), v_name, v_email, v_reason);

  with changed as (
    update public.barangay_memberships membership
    set status = 'suspended'
    where membership.user_id = p_user_id and membership.status = 'active'
    returning membership.id, membership.barangay_id, membership.role_id
  )
  insert into public.membership_access_events(
    barangay_id, membership_id, actor_id, action, from_role, to_role, from_status, to_status
  )
  select changed.barangay_id, changed.id, (select auth.uid()), 'status_changed', role.key, role.key, 'active', 'suspended'
  from changed join public.role_definitions role on role.id = changed.role_id;

  update public.invitations invitation
  set status = 'revoked'
  where invitation.status = 'pending'
    and lower(invitation.invited_email::text) = lower(v_email);
end;
$$;

create or replace function public.complete_platform_captain_account_removal(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the server function may mark completion after the Auth Admin API call.
  if auth.role() <> 'service_role' then raise exception 'not authorized'; end if;
  update public.platform_account_removal_events
  set completed_at = coalesce(completed_at, now())
  where target_user_id = p_user_id;
  if not found then raise exception 'account removal was not prepared'; end if;
end;
$$;

revoke all on function public.list_platform_captain_accounts(integer, integer, text) from public, anon;
revoke all on function public.prepare_platform_captain_account_removal(uuid, text) from public, anon;
revoke all on function public.complete_platform_captain_account_removal(uuid) from public, anon, authenticated;
grant execute on function public.list_platform_captain_accounts(integer, integer, text) to authenticated;
grant execute on function public.prepare_platform_captain_account_removal(uuid, text) to authenticated;
grant execute on function public.complete_platform_captain_account_removal(uuid) to service_role;
