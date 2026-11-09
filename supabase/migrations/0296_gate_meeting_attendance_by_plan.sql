-- Apply the Core Services entitlement to every attendance write path,
-- including self check-in and meeting QR check-in SECURITY DEFINER RPCs.
create or replace function public.enforce_meeting_attendance_core_services_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tenant_plan_feature_enabled(new.barangay_id, 'core_services') then
    raise exception 'the core services feature is not enabled for this barangay';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_meeting_attendance_core_services_plan()
  from public, anon, authenticated;

drop trigger if exists attendance_records_require_core_services
  on public.attendance_records;
create trigger attendance_records_require_core_services
  before insert or update on public.attendance_records
  for each row execute function public.enforce_meeting_attendance_core_services_plan();
