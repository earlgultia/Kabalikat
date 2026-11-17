-- Permit account erasure to release an unfinished committee task assignment
-- even when the barangay's Community Programs entitlement has expired.
create or replace function public.enforce_committee_community_programs_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'committee_tasks' then
    if old.assigned_to is not null
      and new.assigned_to is null
      and old.status in ('open', 'in_progress', 'blocked')
      and new.id is not distinct from old.id
      and new.barangay_id is not distinct from old.barangay_id
      and new.committee_id is not distinct from old.committee_id
      and new.title is not distinct from old.title
      and new.description is not distinct from old.description
      and new.status is not distinct from old.status
      and new.due_date is not distinct from old.due_date
      and new.created_by is not distinct from old.created_by
      and new.updated_by is not distinct from old.updated_by
      and new.created_at is not distinct from old.created_at
      and exists (
        select 1
        from public.profiles profile
        where profile.id = old.assigned_to
          and profile.deleted_at is not null
      ) then
      return new;
    end if;
  end if;

  if not public.tenant_plan_feature_enabled(new.barangay_id, 'community_programs') then
    raise exception 'committee workflows are unavailable under the current subscription plan';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_committee_community_programs_plan()
  from public, anon, authenticated;

-- Ensure soft-delete cleanup runs after the existing Auth cleanup has marked
-- the profile tombstone; hard-delete cleanup already runs after that handler.
drop trigger if exists on_auth_user_release_open_work_soft on auth.users;
create trigger zz_on_auth_user_release_open_work_soft
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.release_open_work_from_erased_member();
