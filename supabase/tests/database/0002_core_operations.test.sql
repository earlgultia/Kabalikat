begin;

select extensions.plan(5);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('30000000-0000-4000-8000-000000000003', 'ops-a@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('40000000-0000-4000-8000-000000000004', 'ops-b@example.invalid', '{}'::jsonb, '{}'::jsonb);

insert into public.barangays (id, name, municipality, province, code)
values
  ('cccccccc-0000-4000-8000-000000000003', 'Operations A', 'Sample City', 'Sample Province', 'OPS-A'),
  ('dddddddd-0000-4000-8000-000000000004', 'Operations B', 'Sample City', 'Sample Province', 'OPS-B');

insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'cccccccc-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', id, 'active'
from public.role_definitions where key = 'captain';
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'dddddddd-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', id, 'active'
from public.role_definitions where key = 'secretary';

insert into public.households (id, barangay_id, household_code, address_line)
values
  ('cccccccc-1000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 'H-A', '1 Sample Road'),
  ('dddddddd-1000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', 'H-B', '2 Sample Road');

insert into public.residents (id, barangay_id, first_name, last_name, household_id, created_by)
values
  ('cccccccc-2000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 'Alex', 'Sample', 'cccccccc-1000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003'),
  ('dddddddd-2000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', 'Bela', 'Sample', 'dddddddd-1000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004');

insert into public.document_requests (id, barangay_id, reference_number, resident_id, document_type_id, purpose)
select 'cccccccc-3000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 'REQ-A',
  'cccccccc-2000-4000-8000-000000000003', id, 'Local records'
from public.document_types where barangay_id = 'cccccccc-0000-4000-8000-000000000003' and code = 'BARANGAY_CERTIFICATE';
insert into public.document_requests (id, barangay_id, reference_number, resident_id, document_type_id, purpose)
select 'dddddddd-3000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', 'REQ-B',
  'dddddddd-2000-4000-8000-000000000004', id, 'Local records'
from public.document_types where barangay_id = 'dddddddd-0000-4000-8000-000000000004' and code = 'BARANGAY_CERTIFICATE';

insert into public.meetings (id, barangay_id, title, location, starts_at, created_by)
values
  ('cccccccc-4000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 'Meeting A', 'Hall A', now(), '30000000-0000-4000-8000-000000000003'),
  ('dddddddd-4000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', 'Meeting B', 'Hall B', now(), '40000000-0000-4000-8000-000000000004');

insert into public.announcements (id, barangay_id, title, body, audience, status, created_by, published_at)
values
  ('cccccccc-5000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 'Notice A', 'A local public notice.', 'public', 'published', '30000000-0000-4000-8000-000000000003', now()),
  ('dddddddd-5000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', 'Notice B', 'A local public notice.', 'public', 'published', '40000000-0000-4000-8000-000000000004', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);

select extensions.is((select count(*) from public.residents), 1::bigint, 'resident list is tenant-scoped');
select extensions.is((select count(*) from public.document_requests), 1::bigint, 'document queue is tenant-scoped');
select extensions.is((select count(*) from public.meetings), 1::bigint, 'meeting list is tenant-scoped');
select extensions.is((select count(*) from public.announcements), 1::bigint, 'announcements are tenant-scoped');
select extensions.is((select count(*) from public.announcement_events), 1::bigint, 'announcement audit trail is tenant-scoped');

select * from extensions.finish();
rollback;
