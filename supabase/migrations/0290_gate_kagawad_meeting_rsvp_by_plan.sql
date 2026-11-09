-- Enforce the meeting feature entitlement for Kagawad RSVP writes at the
-- table boundary, including writes made through SECURITY DEFINER RPCs.
create or replace function public.enforce_meeting_rsvp_core_services_plan()
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

revoke all on function public.enforce_meeting_rsvp_core_services_plan() from public, anon, authenticated;

drop trigger if exists meeting_invitation_responses_require_core_services on public.meeting_invitation_responses;
create trigger meeting_invitation_responses_require_core_services
  before insert or update on public.meeting_invitation_responses
  for each row execute function public.enforce_meeting_rsvp_core_services_plan();
