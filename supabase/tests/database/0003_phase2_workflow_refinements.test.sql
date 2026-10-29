begin;

select extensions.plan(6);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('50000000-0000-4000-8000-000000000005', 'refine-a@example.invalid', '{}'::jsonb, '{}'::jsonb);

insert into public.barangays (id, name, municipality, province, code)
values ('eeeeeeee-0000-4000-8000-000000000005', 'Refinements', 'Sample City', 'Sample Province', 'REF-A');
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'eeeeeeee-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', id, 'active'
from public.role_definitions where key = 'captain';

insert into public.households (id, barangay_id, household_code, address_line)
values ('eeeeeeee-1000-4000-8000-000000000005', 'eeeeeeee-0000-4000-8000-000000000005', 'H-REF', '5 Sample Road');
insert into public.residents (id, barangay_id, user_id, first_name, last_name, household_id, created_by)
values ('eeeeeeee-2000-4000-8000-000000000005', 'eeeeeeee-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', 'Rae', 'Sample', 'eeeeeeee-1000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005');
insert into public.household_members (barangay_id, household_id, resident_id, is_head)
values ('eeeeeeee-0000-4000-8000-000000000005', 'eeeeeeee-1000-4000-8000-000000000005', 'eeeeeeee-2000-4000-8000-000000000005', true);

insert into public.document_requests (id, barangay_id, reference_number, resident_id, document_type_id, purpose, status, rejection_reason)
select 'eeeeeeee-3000-4000-8000-000000000005', 'eeeeeeee-0000-4000-8000-000000000005', 'REQ-REF',
  'eeeeeeee-2000-4000-8000-000000000005', id, 'Initial purpose', 'rejected', 'Please clarify the intended use.'
from public.document_types where barangay_id = 'eeeeeeee-0000-4000-8000-000000000005' and code = 'BARANGAY_CERTIFICATE';
insert into public.document_request_events (barangay_id, request_id, actor_id, from_status, to_status, reason)
values ('eeeeeeee-0000-4000-8000-000000000005', 'eeeeeeee-3000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', 'under_review', 'rejected', 'Please clarify the intended use.');

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000005', true);

select public.register_resident(
  'eeeeeeee-0000-4000-8000-000000000005', 'Sam', 'Sample', null, null,
  'eeeeeeee-1000-4000-8000-000000000005', null, null, null
);
select public.resubmit_document_request('eeeeeeee-3000-4000-8000-000000000005', 'Updated official purpose');

select extensions.is((select count(*) from public.household_members where household_id = 'eeeeeeee-1000-4000-8000-000000000005' and is_head), 1::bigint, 'an existing household retains exactly one head');
select extensions.is((select count(*) from public.household_members hm join public.residents r on r.id = hm.resident_id where hm.household_id = 'eeeeeeee-1000-4000-8000-000000000005' and r.first_name = 'Sam' and not hm.is_head), 1::bigint, 'a resident added to an existing household is not a second head');
select extensions.is((select status from public.document_requests where id = 'eeeeeeee-3000-4000-8000-000000000005'), 'pending'::text, 'resubmission returns a rejected request to pending');
select extensions.is((select rejection_reason from public.document_requests where id = 'eeeeeeee-3000-4000-8000-000000000005'), null::text, 'the current rejection reason clears when a request is resubmitted');
select extensions.is((select purpose from public.document_requests where id = 'eeeeeeee-3000-4000-8000-000000000005'), 'Updated official purpose'::text, 'the applicant can correct the request purpose');
select extensions.is((select count(*) from public.document_request_events where request_id = 'eeeeeeee-3000-4000-8000-000000000005' and from_status = 'rejected' and to_status = 'pending'), 1::bigint, 'resubmission adds an auditable status event');

select * from extensions.finish();
rollback;
