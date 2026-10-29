-- KABALIKAT Phase 1: identity, tenant membership, roles and permission catalog.
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.barangays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  municipality text not null,
  province text not null,
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  scope text not null check (scope in ('platform', 'barangay')),
  is_system boolean not null default true
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null
);

create table public.role_permissions (
  role_id uuid not null references public.role_definitions(id) on delete restrict,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  primary key (role_id, permission_id)
);

create table public.barangay_memberships (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role_id uuid not null references public.role_definitions(id) on delete restrict,
  status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'revoked')),
  created_at timestamptz not null default now(),
  unique (barangay_id, user_id)
);

create table public.membership_permissions (
  membership_id uuid not null references public.barangay_memberships(id) on delete restrict,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  effect text not null check (effect in ('allow', 'deny')),
  granted_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (membership_id, permission_id)
);

create table public.platform_administrators (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index memberships_user_status_idx on public.barangay_memberships(user_id, status);
create index memberships_tenant_status_idx on public.barangay_memberships(barangay_id, status);
create index membership_permissions_permission_idx on public.membership_permissions(permission_id);

insert into public.role_definitions (key, label, scope) values
  ('captain', 'Barangay Captain', 'barangay'),
  ('secretary', 'Barangay Secretary', 'barangay'),
  ('treasurer', 'Barangay Treasurer', 'barangay'),
  ('kagawad', 'Barangay Kagawad', 'barangay'),
  ('sk_chairperson', 'SK Chairperson', 'barangay'),
  ('bhw', 'Barangay Health Worker', 'barangay'),
  ('tanod', 'Barangay Tanod', 'barangay'),
  ('resident', 'Resident', 'barangay'),
  ('super_admin', 'Platform Administrator', 'platform');

insert into public.permissions (key, description) values
  ('tenant.read', 'Read the barangay profile and tenant settings'),
  ('membership.read', 'View barangay memberships'),
  ('membership.manage', 'Invite and manage barangay memberships'),
  ('resident.read', 'Read resident records'),
  ('resident.manage', 'Create and update resident records'),
  ('document.process', 'Process barangay document requests'),
  ('finance.read', 'Read financial records'),
  ('finance.manage', 'Manage financial records'),
  ('meeting.manage', 'Manage meetings and attendance'),
  ('announcement.manage', 'Manage announcements');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.role_definitions r cross join public.permissions p
where (r.key = 'captain' and p.key in ('tenant.read','membership.read','membership.manage','resident.read','resident.manage','document.process','finance.read','meeting.manage','announcement.manage'))
   or (r.key = 'secretary' and p.key in ('tenant.read','membership.read','resident.read','resident.manage','document.process','meeting.manage','announcement.manage'))
   or (r.key = 'treasurer' and p.key in ('tenant.read','finance.read','finance.manage'))
   or (r.key = 'kagawad' and p.key in ('tenant.read','meeting.manage'))
   or (r.key = 'resident' and p.key in ('tenant.read'));

create or replace function public.has_tenant_permission(p_barangay_id uuid, p_permission text)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barangay_memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    left join public.membership_permissions mp on mp.membership_id = m.id and mp.permission_id = p.id
    where m.user_id = (select auth.uid())
      and m.barangay_id = p_barangay_id
      and m.status = 'active'
      and p.key = p_permission
      and coalesce(mp.effect, 'allow') = 'allow'
  );
$$;

create or replace function public.is_active_member(p_barangay_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.barangay_memberships m
    where m.user_id = (select auth.uid()) and m.barangay_id = p_barangay_id and m.status = 'active');
$$;

create or replace function public.is_platform_administrator()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_administrators a where a.user_id = (select auth.uid()));
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

alter table public.profiles enable row level security;
alter table public.barangays enable row level security;
alter table public.role_definitions enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.barangay_memberships enable row level security;
alter table public.membership_permissions enable row level security;
alter table public.platform_administrators enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy barangays_read_member on public.barangays for select to authenticated using (public.is_active_member(id));
create policy roles_read_authenticated on public.role_definitions for select to authenticated using (true);
create policy permissions_read_authenticated on public.permissions for select to authenticated using (true);
create policy role_permissions_read_authenticated on public.role_permissions for select to authenticated using (true);
create policy memberships_read_self_or_manager on public.barangay_memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.has_tenant_permission(barangay_id, 'membership.read'));
create policy membership_permissions_read_member on public.membership_permissions for select to authenticated
  using (exists (select 1 from public.barangay_memberships m where m.id = membership_id
    and (m.user_id = (select auth.uid()) or public.has_tenant_permission(m.barangay_id, 'membership.read'))));
-- Platform administrator membership is provisioned out of band; no client policies are granted.

revoke all on public.platform_administrators from anon, authenticated;
revoke all on public.profiles, public.barangays, public.role_definitions, public.permissions,
  public.role_permissions, public.barangay_memberships, public.membership_permissions from anon, authenticated;
revoke all on function public.has_tenant_permission(uuid, text) from public, anon;
revoke all on function public.is_active_member(uuid) from public, anon;
revoke all on function public.is_platform_administrator() from public, anon;
revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
grant select, update (display_name) on public.profiles to authenticated;
grant select on public.barangays, public.role_definitions, public.permissions, public.role_permissions,
  public.barangay_memberships, public.membership_permissions to authenticated;
grant execute on function public.has_tenant_permission(uuid, text) to authenticated;
grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.is_platform_administrator() to authenticated;
