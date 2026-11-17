-- The platform activity redaction guard permits name changes only after the
-- actor profile is marked as an erased-account tombstone. PostgreSQL orders
-- same-event triggers by name, so run this soft-delete trigger after the
-- existing auth cleanup trigger has updated public.profiles.deleted_at.
drop trigger if exists on_auth_user_platform_activity_actor_soft_redaction on auth.users;

create trigger zz_on_auth_user_platform_activity_actor_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_platform_activity_actor_snapshot_before_auth_deletion();
