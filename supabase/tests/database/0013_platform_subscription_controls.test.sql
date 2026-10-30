begin;

select extensions.plan(12);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('c1000000-0000-4000-8000-000000000013', 'subscription-platform-admin@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('c2000000-0000-4000-8000-000000000013', 'subscription-barangay-captain@example.invalid', '{}'::jsonb, '{}'::jsonb);

insert into public.platform_administrators (user_id)
values ('c1000000-0000-4000-8000-000000000013');
insert into public.barangays (id, name, municipality, province, code)
values ('cccccccc-0000-4000-8000-000000000013', 'Subscription Test', 'Sample City', 'Sample Province', 'SUB-TEST');
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'cccccccc-0000-4000-8000-000000000013', 'c2000000-0000-4000-8000-000000000013', id, 'active'
from public.role_definitions where key = 'captain';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000013', true);
select extensions.throws_ok('select * from public.get_platform_subscription_plans()', 'P0001', 'not authorized', 'a barangay captain cannot read platform subscription plans');
select extensions.throws_ok('select * from public.get_platform_subscription_overview()', 'P0001', 'not authorized', 'a barangay captain cannot read the platform subscription directory');
select extensions.throws_ok(
  'select public.set_platform_subscription(''cccccccc-0000-4000-8000-000000000013'', ''pro'', ''active'', 14, 7, ''Unauthorized plan update'')',
  'P0001', 'not authorized', 'a barangay captain cannot modify subscription status or plan'
);
select extensions.is((select count(*) from public.subscription_plans), 0::bigint, 'row security hides the platform plan catalog from barangay staff');
select extensions.is((select count(*) from public.subscriptions), 0::bigint, 'row security hides subscription records from barangay staff');

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000013', true);
select extensions.is((select count(*) from public.get_platform_subscription_plans()), 3::bigint, 'a registered platform administrator can read active plan metadata');
select extensions.is((select count(*) from public.get_platform_subscription_overview()), 1::bigint, 'the platform administrator can review tenant subscription metadata');
select extensions.lives_ok(
  'select public.set_platform_subscription(''cccccccc-0000-4000-8000-000000000013'', ''pro'', ''trial'', 14, 7, ''Approved evaluation period'')',
  'the platform administrator can assign a validated trial'
);
select extensions.is((select status from public.subscriptions where barangay_id = 'cccccccc-0000-4000-8000-000000000013'), 'trial'::text, 'the trial status is persisted');
select extensions.is((select trial_ends_at > now() and grace_ends_at > trial_ends_at from public.subscriptions where barangay_id = 'cccccccc-0000-4000-8000-000000000013'), true, 'trial and grace end dates follow the configured durations');
select extensions.is((select count(*) from public.subscription_events where to_status = 'trial' and to_plan = 'pro'), 1::bigint, 'a plan change creates an auditable subscription event');
select extensions.throws_ok(
  'select public.set_platform_subscription(''cccccccc-0000-4000-8000-000000000013'', ''pro'', ''trial'', 0, 7, ''Invalid trial duration'')',
  'P0001', 'trial plan or duration is invalid', 'invalid trial duration is rejected'
);

select * from extensions.finish();
rollback;
