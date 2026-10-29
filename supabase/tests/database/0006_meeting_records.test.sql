begin;

select extensions.plan(4);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('90000000-0000-4000-8000-000000000009', 'records-a@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('a0000000-0000-4000-8000-00000000000a', 'records-b@example.invalid', '{}'::jsonb, '{}'::jsonb);
insert into public.barangays (id, name, municipality, province, code)
values
  ('acadacad-0000-4000-8000-000000000009', 'Records A', 'Sample City', 'Sample Province', 'REC-A'),
  ('badbadba-0000-4000-8000-00000000000a', 'Records B', 'Sample City', 'Sample Province', 'REC-B');
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'acadacad-0000-4000-8000-000000000009', '90000000-0000-4000-8000-000000000009', id, 'active'
from public.role_definitions where key = 'secretary';
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'badbadba-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', id, 'active'
from public.role_definitions where key = 'secretary';
insert into public.meetings (id, barangay_id, title, location, starts_at, created_by)
values
  ('90000000-1000-4000-8000-000000000009', 'acadacad-0000-4000-8000-000000000009', 'Assembly A', 'Hall A', now(), '90000000-0000-4000-8000-000000000009'),
  ('a0000000-1000-4000-8000-00000000000a', 'badbadba-0000-4000-8000-00000000000a', 'Assembly B', 'Hall B', now(), 'a0000000-0000-4000-8000-00000000000a');
insert into public.meeting_minutes (barangay_id, meeting_id, content, status, updated_by)
values
  ('acadacad-0000-4000-8000-000000000009', '90000000-1000-4000-8000-000000000009', 'Minutes for assembly A', 'reviewed', '90000000-0000-4000-8000-000000000009'),
  ('badbadba-0000-4000-8000-00000000000a', 'a0000000-1000-4000-8000-00000000000a', 'Minutes for assembly B', 'reviewed', 'a0000000-0000-4000-8000-00000000000a');
insert into public.meeting_resolutions (barangay_id, meeting_id, resolution_number, title, content, status, proposed_by)
values
  ('acadacad-0000-4000-8000-000000000009', '90000000-1000-4000-8000-000000000009', 'RES-2026-900001', 'Resolution A', 'Decision for assembly A', 'draft', '90000000-0000-4000-8000-000000000009'),
  ('badbadba-0000-4000-8000-00000000000a', 'a0000000-1000-4000-8000-00000000000a', 'RES-2026-900002', 'Resolution B', 'Decision for assembly B', 'draft', 'a0000000-0000-4000-8000-00000000000a');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000009', true);

select extensions.is((select count(*) from public.meeting_minutes), 1::bigint, 'minutes reads are tenant-scoped');
select extensions.is((select count(*) from public.meeting_resolutions), 1::bigint, 'resolution reads are tenant-scoped');
select extensions.is(public.has_tenant_permission('badbadba-0000-4000-8000-00000000000a', 'meeting.manage'), false, 'meeting management permission denies another tenant');
select extensions.is((select status from public.meeting_resolutions where resolution_number = 'RES-2026-900001'), 'draft', 'proposed resolutions remain drafts until approved');

select * from extensions.finish();
rollback;
