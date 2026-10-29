begin;

select extensions.plan(2);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('60000000-0000-4000-8000-000000000006', 'invite-a@example.invalid', '{}'::jsonb, '{}'::jsonb);
insert into public.barangays (id, name, municipality, province, code)
values ('ffffffff-0000-4000-8000-000000000006', 'Invitations', 'Sample City', 'Sample Province', 'INV-A');
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'ffffffff-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000006', id, 'active'
from public.role_definitions where key = 'captain';
insert into public.invitations (id, barangay_id, invited_email, role_id, token_hash, invited_by, expires_at)
select 'ffffffff-1000-4000-8000-000000000006', 'ffffffff-0000-4000-8000-000000000006', 'pending@example.invalid', id,
  repeat('a', 64), '60000000-0000-4000-8000-000000000006', now() + interval '7 days'
from public.role_definitions where key = 'secretary';

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000006', true);
select public.revoke_membership_invitation('ffffffff-1000-4000-8000-000000000006');

select extensions.is((select status from public.invitations where id = 'ffffffff-1000-4000-8000-000000000006'), 'revoked'::text, 'authorized captain can revoke a pending invitation');
select extensions.is((select action from public.invitation_events where invitation_id = 'ffffffff-1000-4000-8000-000000000006' order by created_at desc limit 1), 'revoked'::text, 'revocation is recorded in the protected invitation event log');

select * from extensions.finish();
rollback;
