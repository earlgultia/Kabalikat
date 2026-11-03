-- Let Kagawads submit progress on active barangay projects without granting
-- project creation or lifecycle management. Also resolve manager notification
-- recipients against each recipient's role and membership override.

insert into public.permissions(key, description)
values ('project.update', 'Record progress and milestones on barangay projects')
on conflict (key) do update set description = excluded.description;

delete from public.role_permissions rp
using public.role_definitions role, public.permissions permission
where rp.role_id = role.id
  and rp.permission_id = permission.id
  and role.key = 'kagawad'
  and permission.key = 'project.manage';

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.role_definitions role
cross join public.permissions permission
where role.key = 'kagawad'
  and permission.key = 'project.update'
on conflict do nothing;

create or replace function public.add_barangay_project_update(
  p_project_id uuid,
  p_update_type text,
  p_title text,
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.barangay_projects%rowtype;
  v_id uuid;
  v_is_kagawad boolean;
begin
  select * into v_project
  from public.barangay_projects project
  where project.id = p_project_id;

  if not found or not public.is_active_member(v_project.barangay_id) then
    raise exception 'not authorized';
  end if;

  select exists (
    select 1
    from public.barangay_memberships membership
    join public.role_definitions role on role.id = membership.role_id
    where membership.barangay_id = v_project.barangay_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and role.key = 'kagawad'
  ) into v_is_kagawad;

  if v_is_kagawad then
    if not public.has_tenant_permission(v_project.barangay_id, 'project.update') then
      raise exception 'not authorized';
    end if;
  elsif not public.has_tenant_permission(v_project.barangay_id, 'project.manage') then
    raise exception 'not authorized';
  end if;

  if v_project.status not in ('active', 'paused')
    or p_update_type not in ('milestone', 'progress')
    or length(trim(coalesce(p_title, ''))) not between 3 and 180
    or length(coalesce(p_details, '')) > 3000 then
    raise exception 'invalid project update';
  end if;

  insert into public.barangay_project_updates(
    barangay_id, project_id, update_type, title, details, created_by
  ) values (
    v_project.barangay_id, v_project.id, p_update_type,
    trim(p_title), trim(coalesce(p_details, '')), (select auth.uid())
  ) returning id into v_id;

  insert into public.barangay_project_events(
    barangay_id, project_id, actor_id, action, details
  ) values (
    v_project.barangay_id, v_project.id, (select auth.uid()),
    'update_added', trim(p_title)
  );

  return v_id;
end;
$$;

revoke all on function public.add_barangay_project_update(uuid, text, text, text) from public, anon;
grant execute on function public.add_barangay_project_update(uuid, text, text, text) to authenticated;

create or replace function public.notify_project_managers_of_kagawad_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.barangay_memberships author_membership
    join public.role_definitions author_role on author_role.id = author_membership.role_id
    where author_membership.barangay_id = new.barangay_id
      and author_membership.user_id = new.created_by
      and author_membership.status = 'active'
      and author_role.key = 'kagawad'
  ) then
    return new;
  end if;

  if not public.tenant_plan_feature_enabled(new.barangay_id, 'community_programs') then
    return new;
  end if;

  insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
  select new.barangay_id, recipient.user_id, 'barangay_project_update', new.project_id
  from public.barangay_memberships recipient
  join public.role_permissions role_permission on role_permission.role_id = recipient.role_id
  join public.permissions permission on permission.id = role_permission.permission_id
  left join public.membership_permissions member_permission
    on member_permission.membership_id = recipient.id
   and member_permission.permission_id = permission.id
  where recipient.barangay_id = new.barangay_id
    and recipient.status = 'active'
    and recipient.user_id <> new.created_by
    and permission.key = 'project.manage'
    and coalesce(member_permission.effect, 'allow') = 'allow'
  on conflict (recipient_id, resource_type, resource_id)
  do update set created_at = now(), read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_project_managers_of_kagawad_update() from public, anon, authenticated;

