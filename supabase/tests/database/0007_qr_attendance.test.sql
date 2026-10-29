begin;

select extensions.plan(4);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('b1000000-0000-4000-8000-00000000000b', 'qr-a@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('b2000000-0000-4000-8000-00000000000c', 'qr-b@example.invalid', '{}'::jsonb, '{}'::jsonb);
insert into public.barangays (id, name, municipality, province, code)
values
  ('bacabaca-0000-4000-8000-00000000000b', 'QR A', 'Sample City', 'Sample Province', 'QR-A'),
  ('bcacbcac-0000-4000-8000-00000000000c', 'QR B', 'Sample City', 'Sample Province', 'QR-B');
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'bacabaca-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-00000000000b', id, 'active'
from public.role_definitions where key = 'secretary';
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'bcacbcac-0000-4000-8000-00000000000c', 'b2000000-0000-4000-8000-00000000000c', id, 'active'
from public.role_definitions where key = 'secretary';
insert into public.meetings (id, barangay_id, title, location, starts_at, created_by)
values
  ('b1000000-1000-4000-8000-00000000000b', 'bacabaca-0000-4000-8000-00000000000b', 'QR Meeting A', 'Hall A', now(), 'b1000000-0000-4000-8000-00000000000b'),
  ('b2000000-1000-4000-8000-00000000000c', 'bcacbcac-0000-4000-8000-00000000000c', 'QR Meeting B', 'Hall B', now(), 'b2000000-0000-4000-8000-00000000000c');
insert into public.meeting_attendees (meeting_id, barangay_id, user_id, added_by)
values ('b1000000-1000-4000-8000-00000000000b', 'bacabaca-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-00000000000b', true);
create temporary table generated_qr_token as
  select public.create_meeting_attendance_token('b1000000-1000-4000-8000-00000000000b')->>'token' as token;

select extensions.is(public.has_tenant_permission('bcacbcac-0000-4000-8000-00000000000c', 'attendance.manage'), false, 'QR token management does not cross barangay boundaries');
select extensions.is((select length(token) from generated_qr_token), 64, 'QR token is a high-entropy opaque value');
select extensions.lives_ok(format('select public.check_in_with_meeting_qr(%L::uuid, %L)', 'b1000000-1000-4000-8000-00000000000b', (select token from generated_qr_token)), 'eligible attendee can check in with the issued token');
select extensions.is((select source from public.attendance_records where meeting_id = 'b1000000-1000-4000-8000-00000000000b'), 'qr_checkin', 'QR check-in is recorded with an auditable source');

select * from extensions.finish();
rollback;
