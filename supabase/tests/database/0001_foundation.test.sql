begin;

select extensions.plan(6);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'rls-a@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('20000000-0000-4000-8000-000000000002', 'rls-b@example.invalid', '{}'::jsonb, '{}'::jsonb);

insert into public.barangays (id, name, municipality, province, code)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Tenant A', 'Sample City', 'Sample Province', 'RLS-A'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Tenant B', 'Sample City', 'Sample Province', 'RLS-B');

insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'aaaaaaaa-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', id, 'active'
from public.role_definitions where key = 'captain';

insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'bbbbbbbb-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', id, 'active'
from public.role_definitions where key = 'secretary';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select extensions.is((select count(*) from public.barangays), 1::bigint, 'a member can read only their own barangay');
select extensions.is((select count(*) from public.barangays where id = 'bbbbbbbb-0000-4000-8000-000000000002'), 0::bigint, 'tenant A cannot read tenant B');
select extensions.is((select count(*) from public.profiles), 1::bigint, 'a user can read only their own profile');
select extensions.ok(public.has_tenant_permission('aaaaaaaa-0000-4000-8000-000000000001', 'membership.manage'), 'role permission is resolved for the active tenant');
select extensions.is(public.has_tenant_permission('bbbbbbbb-0000-4000-8000-000000000002', 'membership.manage'), false, 'permission check denies another tenant');
select extensions.is(public.is_platform_administrator(), false, 'barangay membership does not grant platform administration');

select * from extensions.finish();
rollback;
