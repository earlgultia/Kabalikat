-- Let barangay leadership remove an unsafe or outdated public post from the
-- member feed while preserving its row for operational history.
alter table public.barangay_official_public_updates
  add column withdrawn_at timestamptz;

alter table public.barangay_finance_public_updates
  add column withdrawn_at timestamptz;

insert into public.permissions (key, description)
values
  ('barangay.public_update.moderate', 'Withdraw public barangay progress updates'),
  ('finance.public_update.moderate', 'Withdraw public finance updates')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role_definition.id, permission.id
from public.role_definitions role_definition
cross join public.permissions permission
where role_definition.key in ('captain', 'secretary')
  and permission.key in ('barangay.public_update.moderate', 'finance.public_update.moderate')
on conflict do nothing;

drop policy if exists barangay_official_public_updates_read_entitled_members
  on public.barangay_official_public_updates;
create policy barangay_official_public_updates_read_entitled_members
  on public.barangay_official_public_updates for select to authenticated
  using (
    withdrawn_at is null
    and public.is_active_member(barangay_id)
    and public.tenant_plan_feature_enabled(barangay_id, 'community_programs')
  );

drop policy if exists barangay_finance_public_updates_read_finance_members
  on public.barangay_finance_public_updates;
create policy barangay_finance_public_updates_read_finance_members
  on public.barangay_finance_public_updates for select to authenticated
  using (
    withdrawn_at is null
    and public.is_active_member(barangay_id)
    and public.tenant_plan_feature_enabled(barangay_id, 'finance')
  );

-- Withdrawal is allowed after plan expiry, but plan checks still apply when a
-- post is created or its public content or tenant is changed.
drop trigger if exists barangay_official_public_updates_require_community_programs
  on public.barangay_official_public_updates;
drop trigger if exists barangay_official_public_updates_require_community_programs_update
  on public.barangay_official_public_updates;
create trigger barangay_official_public_updates_require_community_programs
  before insert
  on public.barangay_official_public_updates
  for each row execute function public.enforce_public_update_plan();
create trigger barangay_official_public_updates_require_community_programs_update
  before update of barangay_id, update_type, title, body
  on public.barangay_official_public_updates
  for each row execute function public.enforce_public_update_plan();

drop trigger if exists barangay_finance_public_updates_require_finance
  on public.barangay_finance_public_updates;
drop trigger if exists barangay_finance_public_updates_require_finance_update
  on public.barangay_finance_public_updates;
create trigger barangay_finance_public_updates_require_finance
  before insert
  on public.barangay_finance_public_updates
  for each row execute function public.enforce_public_finance_update_plan();
create trigger barangay_finance_public_updates_require_finance_update
  before update of barangay_id, title, body
  on public.barangay_finance_public_updates
  for each row execute function public.enforce_public_finance_update_plan();

create or replace function public.withdraw_barangay_official_public_update(p_update_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in is required'; end if;
  select update_row.barangay_id into v_barangay_id
  from public.barangay_official_public_updates update_row
  where update_row.id = p_update_id and update_row.withdrawn_at is null
  for update;
  if v_barangay_id is null then raise exception 'public update was not found or is already withdrawn'; end if;
  if not public.is_active_member(v_barangay_id)
    or not public.has_tenant_permission(v_barangay_id, 'barangay.public_update.moderate') then
    raise exception 'only an authorized barangay captain or secretary can withdraw this update';
  end if;
  update public.barangay_official_public_updates
  set withdrawn_at = now()
  where id = p_update_id and withdrawn_at is null;
end;
$$;

create or replace function public.withdraw_barangay_finance_public_update(p_update_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in is required'; end if;
  select update_row.barangay_id into v_barangay_id
  from public.barangay_finance_public_updates update_row
  where update_row.id = p_update_id and update_row.withdrawn_at is null
  for update;
  if v_barangay_id is null then raise exception 'public finance update was not found or is already withdrawn'; end if;
  if not public.is_active_member(v_barangay_id)
    or not public.has_tenant_permission(v_barangay_id, 'finance.public_update.moderate') then
    raise exception 'only an authorized barangay captain or secretary can withdraw this update';
  end if;
  update public.barangay_finance_public_updates
  set withdrawn_at = now()
  where id = p_update_id and withdrawn_at is null;
end;
$$;

revoke all on function public.withdraw_barangay_official_public_update(uuid) from public, anon;
revoke all on function public.withdraw_barangay_finance_public_update(uuid) from public, anon;
grant execute on function public.withdraw_barangay_official_public_update(uuid) to authenticated;
grant execute on function public.withdraw_barangay_finance_public_update(uuid) to authenticated;
