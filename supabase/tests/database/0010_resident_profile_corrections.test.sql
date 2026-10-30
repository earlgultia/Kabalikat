begin;

select extensions.plan(25);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('f1000000-0000-4000-8000-000000000001', 'correction-owner@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('f2000000-0000-4000-8000-000000000002', 'correction-other-resident@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('f3000000-0000-4000-8000-000000000003', 'correction-staff@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('f4000000-0000-4000-8000-000000000004', 'correction-other-barangay@example.invalid', '{}'::jsonb, '{}'::jsonb);

insert into public.barangays (id, name, municipality, province, code)
values
  ('ffffffff-0000-4000-8000-000000000001', 'Correction Test A', 'Sample City', 'Sample Province', 'CORR-A'),
  ('ffffffff-0000-4000-8000-000000000002', 'Correction Test B', 'Sample City', 'Sample Province', 'CORR-B');

insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'ffffffff-0000-4000-8000-000000000001', u.user_id, r.id, 'active'
from (values
  ('f1000000-0000-4000-8000-000000000001'::uuid, 'resident'),
  ('f2000000-0000-4000-8000-000000000002'::uuid, 'resident'),
  ('f3000000-0000-4000-8000-000000000003'::uuid, 'captain')
) as u(user_id, role_key)
join public.role_definitions r on r.key = u.role_key;
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'ffffffff-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000004', id, 'active'
from public.role_definitions where key = 'captain';

insert into public.residents (id, barangay_id, user_id, first_name, last_name, phone, created_by)
values
  ('ffffffff-1000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Rina', 'Owner', '09170000001', 'f3000000-0000-4000-8000-000000000003'),
  ('ffffffff-1000-4000-8000-000000000002', 'ffffffff-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', 'Noel', 'Neighbor', '09170000002', 'f3000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);

create temporary table test_correction_owner_request as
  select public.submit_resident_profile_change(
    'ffffffff-1000-4000-8000-000000000001', 'Rina Mae', null, null, 'Correct my first name'
  ) as id;
select extensions.is((select status from public.resident_profile_change_requests where id = (select id from test_correction_owner_request)), 'pending'::text, 'a linked resident can submit a profile correction');
select extensions.is((select first_name from public.residents where id = 'ffffffff-1000-4000-8000-000000000001'), 'Rina'::text, 'submitting a correction does not directly change the official resident record');
select extensions.is((select count(*) from public.resident_profile_change_requests), 1::bigint, 'a requester can read their own correction request');
select extensions.is((select count(*) from public.resident_profile_change_events where request_id = (select id from test_correction_owner_request) and action = 'submitted'), 1::bigint, 'submission writes a private audit event');

select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000002', true);
create temporary table test_correction_other_request as
  select public.submit_resident_profile_change(
    'ffffffff-1000-4000-8000-000000000002', null, 'Neighbor Updated', null, null
  ) as id;
select extensions.is((select count(*) from public.resident_profile_change_requests), 1::bigint, 'a second resident sees only their own request');
select extensions.is((select count(*) from public.resident_profile_change_requests where id = (select id from test_correction_owner_request)), 0::bigint, 'a resident cannot read another resident request');
select extensions.is((select count(*) from public.resident_profile_change_events where request_id = (select id from test_correction_owner_request)), 0::bigint, 'a resident cannot read another resident audit history');
select extensions.throws_ok(
  format('select public.cancel_resident_profile_change(%L::uuid)', (select id::text from test_correction_owner_request)),
  'P0001', 'not authorized', 'a different resident cannot withdraw someone else’s request'
);
select extensions.is((select status from public.resident_profile_change_requests where id = (select id from test_correction_owner_request)), 'pending'::text, 'a denied withdrawal leaves the owner request pending');
select extensions.lives_ok(
  format('select public.cancel_resident_profile_change(%L::uuid)', (select id::text from test_correction_other_request)),
  'a resident can withdraw their own pending correction'
);
select extensions.is((select status from public.resident_profile_change_requests where id = (select id from test_correction_other_request)), 'cancelled'::text, 'withdrawal marks the request cancelled');
select extensions.is((select count(*) from public.resident_profile_change_events where request_id = (select id from test_correction_other_request) and action = 'cancelled'), 1::bigint, 'withdrawal is recorded in the audit history');
select extensions.lives_ok(
  'select public.submit_resident_profile_change(''ffffffff-1000-4000-8000-000000000002'', null, ''Neighbor Again'', null, null)',
  'a cancelled request no longer blocks a replacement correction'
);

select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.resident_profile_change_requests), 2::bigint, 'authorized staff can review requests in their barangay');
select extensions.lives_ok(
  format('select public.review_resident_profile_change(%L::uuid, %L, null)', (select id::text from test_correction_owner_request), 'approved'),
  'authorized staff can approve another resident correction'
);
select extensions.is((select first_name from public.residents where id = 'ffffffff-1000-4000-8000-000000000001'), 'Rina Mae'::text, 'approval applies the proposed value to the official resident record');
select extensions.is((select status from public.resident_profile_change_requests where id = (select id from test_correction_owner_request)), 'approved'::text, 'approval records a terminal request status');
select extensions.is((select count(*) from public.resident_profile_change_events where request_id = (select id from test_correction_owner_request) and action = 'approved'), 1::bigint, 'approval adds a protected audit event');
select extensions.is((select count(*) from public.community_notifications), 0::bigint, 'staff cannot read a request owner notification');

reset role;
select extensions.is((select count(*) from public.community_notifications where recipient_id = 'f1000000-0000-4000-8000-000000000001' and resource_type = 'resident_profile_change' and resource_id = (select id from test_correction_owner_request)), 1::bigint, 'the decision creates a notification for the request owner');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from public.community_notifications), 0::bigint, 'another resident cannot read the correction decision notification');
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*) from public.community_notifications), 1::bigint, 'only the request owner can read their decision notification');
select extensions.is((select count(*) from public.resident_profile_change_events where request_id = (select id from test_correction_owner_request)), 2::bigint, 'the request owner can read their complete submission and decision history');

select set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*) from public.resident_profile_change_requests), 0::bigint, 'staff from another barangay cannot read correction requests');
select extensions.throws_ok(
  format('select public.review_resident_profile_change(%L::uuid, %L, null)', (select id::text from test_correction_owner_request), 'approved'),
  'P0001', 'not authorized', 'staff from another barangay cannot review a correction'
);

select * from extensions.finish();
rollback;
