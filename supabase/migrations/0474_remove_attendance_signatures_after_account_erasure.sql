-- Attendance remains as an operational record after account erasure, but a
-- handwritten signature is personal data and must not remain attached to it.
create or replace function public.remove_erased_member_attendance_signatures()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    delete from public.meeting_attendance_signatures
    where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.remove_erased_member_attendance_signatures() from public, anon, authenticated;

create trigger profiles_remove_attendance_signatures_after_erasure
  after update of deleted_at on public.profiles
  for each row execute function public.remove_erased_member_attendance_signatures();

-- Clean signatures belonging to accounts erased before this migration.
delete from public.meeting_attendance_signatures signature
using public.profiles profile
where profile.id = signature.user_id
  and profile.deleted_at is not null;
