-- Extend text-only barangay project progress posts to all officials. This does
-- not add file uploads or resident access to private operational records.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.role_definitions role
join public.permissions permission on permission.key = 'project.manage'
where role.key in ('treasurer', 'sk_chairperson', 'bhw', 'tanod')
on conflict do nothing;
