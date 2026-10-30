begin;

select extensions.plan(16);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('e1000000-0000-4000-8000-000000000001', 'announcement-author@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('e2000000-0000-4000-8000-000000000002', 'announcement-target@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('e3000000-0000-4000-8000-000000000003', 'announcement-platform-role@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('e4000000-0000-4000-8000-000000000004', 'announcement-new-target@example.invalid', '{}'::jsonb, '{}'::jsonb);

insert into public.barangays (id, name, municipality, province, code)
values ('eeeeeeee-0000-4000-8000-000000000001', 'Announcement Test', 'Sample City', 'Sample Province', 'ANN-TEST');

insert into public.role_definitions (key, label, scope, is_system)
values
  ('announcement_target_test', 'Announcement Target Test', 'barangay', false),
  ('announcement_new_target_test', 'Announcement New Target Test', 'barangay', false);

insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'eeeeeeee-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', id, 'active'
from public.role_definitions where key = 'captain';
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'eeeeeeee-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', id, 'active'
from public.role_definitions where key = 'announcement_target_test';
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'eeeeeeee-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000004', id, 'active'
from public.role_definitions where key = 'announcement_new_target_test';
-- Deliberately give a platform-scoped role a tenant membership to exercise
-- the trigger and access helper against malformed or legacy membership data.
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'eeeeeeee-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000003', id, 'active'
from public.role_definitions where key = 'super_admin';

insert into public.announcements (
  id, barangay_id, title, body, audience, audience_role_id, status, created_by, published_at
)
select
  'eeeeeeee-1000-4000-8000-000000000001',
  'eeeeeeee-0000-4000-8000-000000000001',
  'Role-targeted notice',
  'This notice is delivered to one barangay role.',
  'role',
  r.id,
  'published',
  'e1000000-0000-4000-8000-000000000001',
  now()
from public.role_definitions r
where r.key = 'announcement_target_test' and r.scope = 'barangay';

-- Simulate a malformed legacy row: application RLS prevents selecting a
-- platform role as an announcement audience, but the trigger must still
-- avoid delivering it if such a row exists.
insert into public.announcements (
  id, barangay_id, title, body, audience, audience_role_id, status, created_by, published_at
)
select
  'eeeeeeee-1000-4000-8000-000000000002',
  'eeeeeeee-0000-4000-8000-000000000001',
  'Invalid platform-targeted notice',
  'Platform roles are not valid barangay announcement audiences.',
  'role',
  r.id,
  'published',
  'e1000000-0000-4000-8000-000000000001',
  now()
from public.role_definitions r
where r.key = 'super_admin' and r.scope = 'platform';

select extensions.is((
  select count(*) from public.community_notifications
  where recipient_id = 'e3000000-0000-4000-8000-000000000003'
    and resource_id = 'eeeeeeee-1000-4000-8000-000000000002'
), 0::bigint, 'the delivery trigger excludes platform-scoped roles even for malformed legacy targets');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);

select extensions.is((select count(*) from public.announcements), 1::bigint, 'the selected barangay role can read its published announcement');
select extensions.is((select count(*) from public.community_notifications), 1::bigint, 'the selected role receives one announcement notification');
select extensions.is(public.can_access_community_notification(
  'announcement', 'eeeeeeee-1000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001'
), true, 'the selected role can access its notification resource');

reset role;
update public.announcements
set audience_role_id = (select id from public.role_definitions where key = 'announcement_new_target_test')
where id = 'eeeeeeee-1000-4000-8000-000000000001';

select extensions.is((
  select count(*) from public.community_notifications
  where recipient_id = 'e4000000-0000-4000-8000-000000000004'
    and resource_id = 'eeeeeeee-1000-4000-8000-000000000001'
), 1::bigint, 'changing a published target delivers a notification to the newly eligible role');
select extensions.is((
  select count(*) from public.community_notifications
  where recipient_id = 'e2000000-0000-4000-8000-000000000002'
    and resource_id = 'eeeeeeee-1000-4000-8000-000000000001'
), 1::bigint, 'retargeting preserves the original delivery record');

update public.announcements
set audience_role_id = (select id from public.role_definitions where key = 'announcement_new_target_test')
where id = 'eeeeeeee-1000-4000-8000-000000000001';
select extensions.is((
  select count(*) from public.community_notifications
  where recipient_id = 'e4000000-0000-4000-8000-000000000004'
    and resource_id = 'eeeeeeee-1000-4000-8000-000000000001'
), 1::bigint, 'saving an unchanged audience does not create a duplicate delivery');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e4000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*) from public.announcements), 1::bigint, 'the newly selected role can read the retargeted announcement');
select extensions.is((select count(*) from public.community_notifications), 1::bigint, 'the newly selected role can read its notification');
select extensions.is(public.can_access_community_notification(
  'announcement', 'eeeeeeee-1000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001'
), true, 'the newly selected role passes the notification resource access check');

select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from public.announcements), 0::bigint, 'the former target role cannot read the retargeted announcement');
select extensions.is((select count(*) from public.community_notifications), 0::bigint, 'the former target role cannot read its now-inaccessible notification');

select set_config('request.jwt.claim.sub', 'e3000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.announcements), 0::bigint, 'a platform-scoped role cannot read a role-targeted barangay announcement');
select extensions.is((select count(*) from public.community_notifications), 0::bigint, 'a platform-scoped role receives no notification for that announcement');
select extensions.is(public.can_access_community_notification(
  'announcement', 'eeeeeeee-1000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000001'
), false, 'the access helper rejects a platform-scoped target even if a malformed announcement exists');

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*) from public.community_notifications), 0::bigint, 'the announcement author does not receive a notification for their own post');

select * from extensions.finish();
rollback;
