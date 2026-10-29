begin;

select extensions.plan(4);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('70000000-0000-4000-8000-000000000007', 'archive-a@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('80000000-0000-4000-8000-000000000008', 'archive-b@example.invalid', '{}'::jsonb, '{}'::jsonb);
insert into public.barangays (id, name, municipality, province, code)
values
  ('abababab-0000-4000-8000-000000000007', 'Archive A', 'Sample City', 'Sample Province', 'ARC-A'),
  ('bcbcbcbc-0000-4000-8000-000000000008', 'Archive B', 'Sample City', 'Sample Province', 'ARC-B');
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'abababab-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000007', id, 'active'
from public.role_definitions where key = 'secretary';
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'bcbcbcbc-0000-4000-8000-000000000008', '80000000-0000-4000-8000-000000000008', id, 'active'
from public.role_definitions where key = 'secretary';

insert into public.archive_folders (id, barangay_id, name, created_by)
values
  ('abababab-1000-4000-8000-000000000007', 'abababab-0000-4000-8000-000000000007', 'Minutes', '70000000-0000-4000-8000-000000000007'),
  ('bcbcbcbc-1000-4000-8000-000000000008', 'bcbcbcbc-0000-4000-8000-000000000008', 'Minutes', '80000000-0000-4000-8000-000000000008');
insert into public.archive_documents (
  id, barangay_id, folder_id, file_name, category, mime_type, file_size, storage_path, extracted_text, text_status, uploaded_by
) values
  ('abababab-2000-4000-8000-000000000007', 'abababab-0000-4000-8000-000000000007', 'abababab-1000-4000-8000-000000000007', 'assembly.pdf', 'Meetings', 'application/pdf', 100, 'abababab-0000-4000-8000-000000000007/abababab-2000-4000-8000-000000000007/assembly.pdf', 'Community assembly minutes', 'reviewed', '70000000-0000-4000-8000-000000000007'),
  ('bcbcbcbc-2000-4000-8000-000000000008', 'bcbcbcbc-0000-4000-8000-000000000008', 'bcbcbcbc-1000-4000-8000-000000000008', 'assembly.pdf', 'Meetings', 'application/pdf', 100, 'bcbcbcbc-0000-4000-8000-000000000008/bcbcbcbc-2000-4000-8000-000000000008/assembly.pdf', 'Community assembly minutes', 'reviewed', '80000000-0000-4000-8000-000000000008');

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000007', true);

select extensions.is((select count(*) from public.archive_folders), 1::bigint, 'archive folder reads are tenant-scoped');
select extensions.is((select count(*) from public.archive_documents), 1::bigint, 'archive document reads are tenant-scoped');
select extensions.is((select count(*) from public.search_archive_documents('abababab-0000-4000-8000-000000000007', 'assembly', null)), 1::bigint, 'archive search returns matching files from the requested tenant');
select extensions.is(public.has_tenant_permission('bcbcbcbc-0000-4000-8000-000000000008', 'archive.read'), false, 'archive search permission denies another tenant');

select * from extensions.finish();
rollback;
