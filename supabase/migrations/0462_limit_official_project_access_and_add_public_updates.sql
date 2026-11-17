-- Keep project administration in its existing roles. Officials receive a
-- narrower permission for publishing text-only community progress updates.
delete from public.role_permissions role_permission
using public.role_definitions role, public.permissions permission
where role_permission.role_id = role.id
  and role_permission.permission_id = permission.id
  and permission.key = 'project.manage'
  and role.key in ('treasurer', 'sk_chairperson', 'bhw', 'tanod');

insert into public.permissions (key, description)
values ('barangay.public_update.create', 'Publish text-only barangay project and accomplishment updates')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.role_definitions role
join public.permissions permission on permission.key = 'barangay.public_update.create'
where role.key in ('captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod')
on conflict do nothing;

create table public.barangay_official_public_updates (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  update_type text not null check (update_type in ('upcoming_project', 'accomplishment', 'progress')),
  title text not null check (length(trim(title)) between 3 and 160),
  body text not null check (length(trim(body)) between 3 and 3000),
  created_at timestamptz not null default now()
);
create index barangay_official_public_updates_feed_idx
  on public.barangay_official_public_updates (barangay_id, created_at desc, id desc);
alter table public.barangay_official_public_updates enable row level security;
create policy barangay_official_public_updates_read_active_members
  on public.barangay_official_public_updates for select to authenticated
  using (public.is_active_member(barangay_id));
revoke all on public.barangay_official_public_updates from anon, authenticated;
grant select on public.barangay_official_public_updates to authenticated;

create or replace function public.create_barangay_official_public_update(
  p_barangay_id uuid,
  p_update_type text,
  p_title text,
  p_body text
)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := extensions.gen_random_uuid();
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null or p_barangay_id is null
    or not public.has_tenant_permission(p_barangay_id, 'barangay.public_update.create') then
    raise exception 'not authorized to publish a barangay update';
  end if;
  if p_update_type not in ('upcoming_project', 'accomplishment', 'progress')
    or length(v_title) not between 3 and 160
    or length(v_body) not between 3 and 3000 then
    raise exception 'provide an update type, title, and details';
  end if;
  insert into public.barangay_official_public_updates(
    id, barangay_id, author_id, update_type, title, body
  ) values (v_id, p_barangay_id, auth.uid(), p_update_type, v_title, v_body);
  return v_id;
end;
$$;
revoke all on function public.create_barangay_official_public_update(uuid, text, text, text) from public, anon;
grant execute on function public.create_barangay_official_public_update(uuid, text, text, text) to authenticated;
