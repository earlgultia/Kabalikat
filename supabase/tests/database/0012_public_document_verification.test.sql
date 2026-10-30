begin;

select extensions.plan(14);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('b1000000-0000-4000-8000-000000000001', 'document-issuer@example.invalid', '{}'::jsonb, '{}'::jsonb);

insert into public.barangays (id, name, municipality, province, code)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'Verification Test', 'Sample City', 'Sample Province', 'VERIFY-A');
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'bbbbbbbb-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', id, 'active'
from public.role_definitions where key = 'captain';

insert into public.residents (id, barangay_id, first_name, last_name, phone, created_by)
values ('bbbbbbbb-1000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'Private', 'Resident', '09170000003', 'b1000000-0000-4000-8000-000000000001');
insert into public.document_types (id, barangay_id, code, name, description)
values ('bbbbbbbb-2000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'VERIFY_CERT', 'Verification Certificate', 'Test document type');
insert into public.document_requests (id, barangay_id, reference_number, resident_id, document_type_id, purpose, status)
values
  ('bbbbbbbb-3000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'A1B2C3D4E5F6', 'bbbbbbbb-1000-4000-8000-000000000001', 'bbbbbbbb-2000-4000-8000-000000000001', 'Proof of residency', 'issued'),
  ('bbbbbbbb-3000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', '112233445566', 'bbbbbbbb-1000-4000-8000-000000000001', 'bbbbbbbb-2000-4000-8000-000000000001', 'Expired test record', 'issued');
insert into public.issued_documents (id, barangay_id, request_id, issuance_number, issued_by, expires_at)
values
  ('bbbbbbbb-4000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-3000-4000-8000-000000000001', '2026-ABCDEF12', 'b1000000-0000-4000-8000-000000000001', now() + interval '30 days'),
  ('bbbbbbbb-4000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-3000-4000-8000-000000000002', '2026-1234ABCD', 'b1000000-0000-4000-8000-000000000001', now() - interval '1 day');

set local role anon;
select extensions.is((select count(*) from public.verify_public_issued_document('A1B2C3D4E5F6', '2026-ABCDEF12')), 1::bigint, 'the public verifier finds a document when both codes match');
select extensions.is((select document_status from public.verify_public_issued_document('A1B2C3D4E5F6', '2026-ABCDEF12')), 'valid'::text, 'the public verifier reports an unexpired issuance as valid');
select extensions.is((select document_type from public.verify_public_issued_document('A1B2C3D4E5F6', '2026-ABCDEF12')), 'Verification Certificate'::text, 'the verifier returns the document type');
select extensions.is((select barangay_name from public.verify_public_issued_document('A1B2C3D4E5F6', '2026-ABCDEF12')), 'Verification Test'::text, 'the verifier returns the issuing barangay');
select extensions.is((select to_jsonb(v) ?| array['resident_name','first_name','last_name','phone','resident_id','reference_number'] from public.verify_public_issued_document('A1B2C3D4E5F6', '2026-ABCDEF12') v), false, 'the public verification result excludes resident identity and internal identifiers');
select extensions.is((select count(*) from public.verify_public_issued_document('short', '2026-ABCDEF12')), 0::bigint, 'malformed reference codes return no result');
select extensions.is((select count(*) from public.verify_public_issued_document('A1B2C3D4E5F6', '2026-00000000')), 0::bigint, 'a mismatched issuance code returns no result');
select extensions.is((select document_status from public.verify_public_issued_document('112233445566', '2026-1234ABCD')), 'expired'::text, 'an expired document is identified as expired');
select extensions.is((select expires_at < now() from public.verify_public_issued_document('112233445566', '2026-1234ABCD')), true, 'the expired result exposes its expiry date for verification');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  'select public.revoke_issued_document(''bbbbbbbb-3000-4000-8000-000000000001'', ''Issued with an incorrect residency date'')',
  'authorized document staff can revoke an issuance with a reason'
);
select extensions.throws_ok(
  'select public.revoke_issued_document(''bbbbbbbb-3000-4000-8000-000000000001'', ''Repeated revocation attempt'')',
  'P0001', 'issued document is no longer valid', 'a revoked issuance cannot be revoked a second time'
);

reset role;
select extensions.is((select verification_status from public.issued_documents where id = 'bbbbbbbb-4000-4000-8000-000000000001'), 'revoked'::text, 'revocation changes verification status');
select extensions.is((select reason from public.issued_document_events where issued_document_id = 'bbbbbbbb-4000-4000-8000-000000000001'), 'Issued with an incorrect residency date'::text, 'revocation reason is retained in the audit event');

set local role anon;
select extensions.is((select document_status from public.verify_public_issued_document('A1B2C3D4E5F6', '2026-ABCDEF12')), 'revoked'::text, 'public verification reflects the revoked status');

select * from extensions.finish();
rollback;
