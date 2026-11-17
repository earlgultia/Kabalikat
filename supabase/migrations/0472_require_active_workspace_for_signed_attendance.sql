-- Signed QR check-in must belong to the currently signed-in attendee in an
-- active barangay workspace when the signature is stored.
create or replace function public.require_active_workspace_for_signed_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or new.user_id <> auth.uid()
    or not public.is_active_member(new.barangay_id) then
    raise exception 'signed attendance requires your active membership in this barangay';
  end if;
  return new;
end;
$$;

revoke all on function public.require_active_workspace_for_signed_attendance() from public, anon, authenticated;

create trigger meeting_attendance_signatures_require_active_member
  before insert on public.meeting_attendance_signatures
  for each row execute function public.require_active_workspace_for_signed_attendance();
