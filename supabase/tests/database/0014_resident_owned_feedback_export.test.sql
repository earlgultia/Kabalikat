begin;

select extensions.plan(9);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('d1000000-0000-4000-8000-000000000001', 'export-feedback-owner@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('d2000000-0000-4000-8000-000000000002', 'export-feedback-other@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('d3000000-0000-4000-8000-000000000003', 'export-feedback-captain@example.invalid', '{}'::jsonb, '{}'::jsonb);

insert into public.barangays (id, name, municipality, province, code)
values
  ('dddddddd-0000-4000-8000-000000000001', 'Feedback Export A', 'Sample City', 'Sample Province', 'FBE-A'),
  ('dddddddd-0000-4000-8000-000000000002', 'Feedback Export B', 'Sample City', 'Sample Province', 'FBE-B');
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'dddddddd-0000-4000-8000-000000000001', u.user_id, r.id, 'active'
from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid, 'resident'),
  ('d2000000-0000-4000-8000-000000000002'::uuid, 'resident'),
  ('d3000000-0000-4000-8000-000000000003'::uuid, 'captain')
) as u(user_id, role_key)
join public.role_definitions r on r.key = u.role_key;
insert into public.residents (id, barangay_id, user_id, first_name, last_name, created_by)
values
  ('dddddddd-1000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Ari', 'Export', 'd3000000-0000-4000-8000-000000000003'),
  ('dddddddd-1000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'Bea', 'Export', 'd3000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
create temporary table test_feedback_export_a as
  select public.submit_community_feedback('dddddddd-0000-4000-8000-000000000001', 'suggestion', 'Safer crosswalk', 'Please review the marked crosswalk near the community hall.') as id;
select extensions.is((select count(*) from public.get_own_community_feedback_export('dddddddd-0000-4000-8000-000000000001')), 1::bigint, 'a resident export contains their own feedback');
select extensions.is((select id from public.get_own_community_feedback_export('dddddddd-0000-4000-8000-000000000001')), (select id from test_feedback_export_a), 'the export returns the owner-submitted feedback record');
select extensions.is((select history @> '[{"action":"submitted"}]'::jsonb from public.get_own_community_feedback_export('dddddddd-0000-4000-8000-000000000001')), true, 'the owner export includes their submission history');
select extensions.is((select count(*) from public.get_own_community_feedback_export('dddddddd-0000-4000-8000-000000000002')), 0::bigint, 'a different barangay identifier does not reveal unrelated feedback');

select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000002', true);
create temporary table test_feedback_export_b as
  select public.submit_community_feedback('dddddddd-0000-4000-8000-000000000001', 'service', 'Clearer queue signs', 'Please add clearer signs for residents waiting in line.') as id;

select set_config('request.jwt.claim.sub', 'd3000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.community_feedback), 2::bigint, 'staff can see both submissions in their authorized queue');
select extensions.is((select count(*) from public.get_own_community_feedback_export('dddddddd-0000-4000-8000-000000000001')), 0::bigint, 'staff queue access does not widen the personal export');

select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from public.get_own_community_feedback_export('dddddddd-0000-4000-8000-000000000001')), 1::bigint, 'a second resident export contains only that residents own feedback');
select extensions.is((select count(*) from public.get_own_community_feedback_export('dddddddd-0000-4000-8000-000000000001') where id = (select id from test_feedback_export_a)), 0::bigint, 'the second resident export excludes the first residents submission');
select extensions.is((select history::text not like '%actor_id%' from public.get_own_community_feedback_export('dddddddd-0000-4000-8000-000000000001')), true, 'the exported feedback history omits internal actor identifiers');

select * from extensions.finish();
rollback;
