begin;

select extensions.plan(11);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('c1000000-0000-4000-8000-00000000000c', 'finance-treasurer@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('c2000000-0000-4000-8000-00000000000c', 'finance-captain@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('c3000000-0000-4000-8000-00000000000c', 'finance-other@example.invalid', '{}'::jsonb, '{}'::jsonb);
insert into public.barangays (id, name, municipality, province, code)
values
  ('cacabaca-0000-4000-8000-00000000000c', 'Finance A', 'Sample City', 'Sample Province', 'FIN-A'),
  ('cbacacba-0000-4000-8000-00000000000c', 'Finance B', 'Sample City', 'Sample Province', 'FIN-B');
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'cacabaca-0000-4000-8000-00000000000c', u.user_id, r.id, 'active'
from (values
  ('c1000000-0000-4000-8000-00000000000c'::uuid, 'treasurer'),
  ('c2000000-0000-4000-8000-00000000000c'::uuid, 'captain')
) as u(user_id, role_key)
join public.role_definitions r on r.key = u.role_key;
insert into public.barangay_memberships (barangay_id, user_id, role_id, status)
select 'cbacacba-0000-4000-8000-00000000000c', 'c3000000-0000-4000-8000-00000000000c', id, 'active'
from public.role_definitions where key = 'treasurer';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-00000000000c', true);
select extensions.is(public.has_tenant_permission('cacabaca-0000-4000-8000-00000000000c', 'finance.manage'), true, 'Treasurer can manage finance in their barangay');
select extensions.is(public.has_tenant_permission('cacabaca-0000-4000-8000-00000000000c', 'finance.approve'), false, 'Treasurer cannot approve their own financial workflows');
select extensions.is(public.has_tenant_permission('cbacacba-0000-4000-8000-00000000000c', 'finance.read'), false, 'financial permissions do not cross barangay boundaries');
create temporary table test_finance_budget as
  select public.create_finance_budget('cacabaca-0000-4000-8000-00000000000c', extract(year from current_date)::integer, 'Operations budget', 1000)::uuid as id;
select extensions.is((select status from public.finance_budgets where id = (select id from test_finance_budget)), 'draft', 'new budgets require independent approval');

select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-00000000000c', true);
select extensions.is(public.has_tenant_permission('cacabaca-0000-4000-8000-00000000000c', 'finance.approve'), true, 'Captain has the separate finance approval permission');
select extensions.lives_ok(format('select public.approve_finance_budget(%L::uuid)', (select id::text from test_finance_budget)), 'Captain can approve another member’s budget');

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-00000000000c', true);
create temporary table test_finance_transaction as
  select public.create_financial_transaction((select id from test_finance_budget), 'expense', 'Supplies', 'Office supplies', 250, current_date)::uuid as id;
select extensions.is((select status from public.financial_transactions where id = (select id from test_finance_transaction)), 'submitted', 'new transactions are submitted for review');
select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-00000000000c', true);
select extensions.lives_ok(format('select public.review_financial_transaction(%L::uuid, true, null)', (select id::text from test_finance_transaction)), 'Captain can post a transaction submitted by the Treasurer');
select extensions.is((select status from public.financial_transactions where id = (select id from test_finance_transaction)), 'posted', 'approved transaction is posted to the ledger');
select extensions.lives_ok(format('select public.void_financial_transaction(%L::uuid, %L)', (select id::text from test_finance_transaction), 'Duplicate entry recorded in error'), 'authorized reviewer can void a posted transaction with a reason');
select extensions.is((select status from public.financial_transactions where id = (select id from test_finance_transaction)), 'voided', 'voiding preserves the transaction as an auditable record');

select * from extensions.finish();
rollback;
