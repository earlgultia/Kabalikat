-- Platform activity names are normally immutable. Permit the erasure trigger
-- to replace a deleted member's snapshot with its generic tombstone label.
create or replace function public.prevent_platform_activity_actor_name_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_name is distinct from old.actor_name
    and not (
      new.actor_name = 'Deleted account'
      and exists (
        select 1
        from public.profiles profile
        where profile.id = old.actor_id
          and profile.deleted_at is not null
      )
    ) then
    raise exception 'platform activity actor name is immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_platform_activity_actor_name_change()
  from public, anon, authenticated;

-- The table is append-only for ordinary activity, but account erasure must be
-- able to anonymize the copied name without changing any other audit field.
create or replace function public.reject_platform_activity_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.actor_name = 'Deleted account'
      and new.actor_name is distinct from old.actor_name
      and new.id is not distinct from old.id
      and new.actor_id is not distinct from old.actor_id
      and new.barangay_id is not distinct from old.barangay_id
      and new.event_type is not distinct from old.event_type
      and new.summary is not distinct from old.summary
      and new.created_at is not distinct from old.created_at
      and exists (
        select 1
        from public.profiles profile
        where profile.id = old.actor_id
          and profile.deleted_at is not null
      ) then
      return new;
    end if;
  end if;

  raise exception 'platform activity events are append-only';
end;
$$;

revoke all on function public.reject_platform_activity_event_mutation()
  from public, anon, authenticated;
