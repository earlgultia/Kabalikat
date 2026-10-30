begin;

select extensions.plan(29);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('a1000000-0000-4000-8000-000000000001', 'feedback-owner@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000002', 'feedback-other-resident@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000003', 'feedback-staff@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000004', 'feedback-other-barangay@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000005', 'feedback-unlinked-member@example.invalid', '{}'::jsonb, '{}'::jsonb);

insert into public.barangays (id, name, municipality, province, code)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Feedback Test A', 'Sample City', 'Sample Province', 'FB-A'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Feedback Test B', 'Sample City', 'Sample Province', 'FB-B');

insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'aaaaaaaa-0000-4000-8000-000000000001', u.user_id, r.id, 'active'
from (values
  ('a1000000-0000-4000-8000-000000000001'::uuid, 'resident'),
  ('a2000000-0000-4000-8000-000000000002'::uuid, 'resident'),
  ('a3000000-0000-4000-8000-000000000003'::uuid, 'captain'),
  ('a5000000-0000-4000-8000-000000000005'::uuid, 'resident')
) as u(user_id, role_key)
join public.role_definitions r on r.key = u.role_key;
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'aaaaaaaa-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000004', id, 'active'
from public.role_definitions where key = 'captain';

insert into public.residents (id, barangay_id, user_id, first_name, last_name, created_by)
values
  ('aaaaaaaa-1000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Faye', 'Owner', 'a3000000-0000-4000-8000-000000000003'),
  ('aaaaaaaa-1000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'Omar', 'Neighbor', 'a3000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
create temporary table test_feedback_owner as
  select public.submit_community_feedback(
    'aaaaaaaa-0000-4000-8000-000000000001', 'accessibility', 'Safer service counter',
    'Please make the service counter easier to reach for residents using mobility aids.'
  ) as id;
select extensions.is((select count(*) from public.community_feedback), 1::bigint, 'a linked resident can submit and read private feedback');
select extensions.is((select message from public.community_feedback where id = (select id from test_feedback_owner)), 'Please make the service counter easier to reach for residents using mobility aids.'::text, 'the owner can read their submitted message');
select extensions.is((select count(*) from public.community_feedback_events where feedback_id = (select id from test_feedback_owner) and action = 'submitted'), 1::bigint, 'submission creates an owner-readable audit event');

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
create temporary table test_feedback_other as
  select public.submit_community_feedback(
    'aaaaaaaa-0000-4000-8000-000000000001', 'suggestion', 'Improve queue updates',
    'Please share clearer updates when the service queue is delayed.'
  ) as id;
select extensions.is((select count(*) from public.community_feedback), 1::bigint, 'a resident sees only their own feedback');
select extensions.is((select count(*) from public.community_feedback where id = (select id from test_feedback_owner)), 0::bigint, 'a resident cannot read another resident feedback');
select extensions.is((select count(*) from public.community_feedback_events where feedback_id = (select id from test_feedback_owner)), 0::bigint, 'a resident cannot read another resident feedback history');

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  'select public.submit_community_feedback(''aaaaaaaa-0000-4000-8000-000000000001'', ''other'', ''Unlinked person'', ''This member has no linked resident profile.'')',
  'P0001', 'an active linked resident profile is required', 'a barangay member without a linked resident profile cannot submit feedback'
);

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*) from public.community_feedback), 0::bigint, 'staff from another barangay cannot read the feedback queue');
select extensions.throws_ok(
  format('select public.update_community_feedback(%L::uuid, %L, null)', (select id::text from test_feedback_owner), 'closed'),
  'P0001', 'not authorized', 'staff from another barangay cannot change feedback status'
);

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.community_feedback), 2::bigint, 'authorized staff can read the barangay feedback queue');
select extensions.is(has_column_privilege('authenticated', 'public.community_feedback', 'submitted_by', 'select'), false, 'the authenticated role cannot select submitter identity directly');
select extensions.is(has_column_privilege('authenticated', 'public.community_feedback', 'responded_by', 'select'), false, 'the authenticated role cannot select staff actor identity directly');
select extensions.lives_ok(
  format('select public.update_community_feedback(%L::uuid, %L, null)', (select id::text from test_feedback_owner), 'in_review'),
  'authorized staff can move feedback into review'
);
select extensions.is((select count(*) from public.community_feedback_events where feedback_id = (select id from test_feedback_owner) and action = 'review_started'), 1::bigint, 'starting review is recorded in the event history');
select extensions.lives_ok(
  format('select public.update_community_feedback(%L::uuid, %L, %L)', (select id::text from test_feedback_owner), 'responded', 'The counter route has been reviewed and will be adjusted.'),
  'authorized staff can respond to feedback'
);
select extensions.is((select status from public.community_feedback where id = (select id from test_feedback_owner)), 'responded'::text, 'the response updates feedback status');
select extensions.is((select count(*) from public.community_notifications), 0::bigint, 'staff cannot read the resident response notification');
select extensions.lives_ok(
  format('select public.update_community_feedback(%L::uuid, %L, %L)', (select id::text from test_feedback_owner), 'closed', 'The accessibility improvement is now complete.'),
  'staff can close feedback with a final response'
);
select extensions.is((select count(*) from public.community_feedback_events where feedback_id = (select id from test_feedback_owner)), 4::bigint, 'submission, review, response, and closure each have an audit event');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select extensions.is((select status from public.community_feedback where id = (select id from test_feedback_owner)), 'closed'::text, 'the owner can see the final feedback status');
select extensions.is((select count(*) from public.community_notifications), 1::bigint, 'the owner receives one response notification across the response and closure updates');
select extensions.is(public.can_access_community_notification('community_feedback', (select id from test_feedback_owner), 'aaaaaaaa-0000-4000-8000-000000000001'), true, 'the owner can access the feedback notification resource');

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from public.community_feedback where id = (select id from test_feedback_owner)), 0::bigint, 'another resident cannot read the closed feedback');
select extensions.is((select count(*) from public.community_notifications), 0::bigint, 'another resident cannot read the feedback response notification');
select extensions.is(public.can_access_community_notification('community_feedback', (select id from test_feedback_owner), 'aaaaaaaa-0000-4000-8000-000000000001'), false, 'the resource access helper rejects another residents feedback notification');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true);
select extensions.lives_ok(
  format('select public.update_community_feedback(%L::uuid, %L, null)', (select id::text from test_feedback_other), 'closed'),
  'staff can close feedback without a written response'
);
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select extensions.is((select status from public.community_feedback where id = (select id from test_feedback_other)), 'closed'::text, 'the owner can see closure without a written response');
select extensions.is((select count(*) from public.community_notifications), 1::bigint, 'closing without a response still notifies the owner');
select extensions.is(public.can_access_community_notification('community_feedback', (select id from test_feedback_other), 'aaaaaaaa-0000-4000-8000-000000000001'), true, 'closed feedback without a response passes the notification access check');

select * from extensions.finish();
rollback;
