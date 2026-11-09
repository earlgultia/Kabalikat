-- Keep attendance-correction submissions and decisions behind the same
-- core-services entitlement as meeting reads and RSVP writes.
create or replace function public.enforce_attendance_correction_core_services_plan()
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

revoke all on function public.enforce_attendance_correction_core_services_plan()
  from public, anon, authenticated;

drop trigger if exists attendance_correction_requests_require_core_services
  on public.meeting_attendance_correction_requests;
create trigger attendance_correction_requests_require_core_services
  before insert or update on public.meeting_attendance_correction_requests
  for each row execute function public.enforce_attendance_correction_core_services_plan();

