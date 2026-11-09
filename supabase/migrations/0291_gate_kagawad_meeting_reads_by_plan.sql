-- Gate Kagawad meeting reads by the core-services entitlement while retaining
-- the existing membership, invitation, filtering, and attendance logic.

alter function public.search_kagawad_invited_meetings(uuid, integer, integer, text, text, date, date)
  rename to search_kagawad_invited_meetings_unchecked;
revoke all on function public.search_kagawad_invited_meetings_unchecked(uuid, integer, integer, text, text, date, date)
  from public, anon, authenticated;

create function public.search_kagawad_invited_meetings(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_response text default 'all',
  p_meeting_date_after date default null,
  p_meeting_date_before date default null
)
returns table (
  id uuid,
  title text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  attendance_status text,
  check_in_open boolean,
  invitation_response text,
  response_updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tenant_plan_feature_enabled(p_barangay_id, 'core_services') then
    raise exception 'not authorized';
  end if;

  return query
  select * from public.search_kagawad_invited_meetings_unchecked(
    p_barangay_id,
    p_page,
    p_page_size,
    p_search,
    p_response,
    p_meeting_date_after,
    p_meeting_date_before
  );
end;
$$;

revoke all on function public.search_kagawad_invited_meetings(uuid, integer, integer, text, text, date, date)
  from public, anon;
grant execute on function public.search_kagawad_invited_meetings(uuid, integer, integer, text, text, date, date)
  to authenticated;

alter function public.get_kagawad_invited_meeting_agenda(uuid)
  rename to get_kagawad_invited_meeting_agenda_unchecked;
revoke all on function public.get_kagawad_invited_meeting_agenda_unchecked(uuid)
  from public, anon, authenticated;

create function public.get_kagawad_invited_meeting_agenda(p_meeting_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  select meeting.barangay_id
  into v_barangay_id
  from public.meetings meeting
  where meeting.id = p_meeting_id;

  if v_barangay_id is null
    or not public.tenant_plan_feature_enabled(v_barangay_id, 'core_services') then
    raise exception 'not authorized';
  end if;

  return public.get_kagawad_invited_meeting_agenda_unchecked(p_meeting_id);
end;
$$;

revoke all on function public.get_kagawad_invited_meeting_agenda(uuid) from public, anon;
grant execute on function public.get_kagawad_invited_meeting_agenda(uuid) to authenticated;

alter function public.get_kagawad_meeting_participation_summary(uuid)
  rename to get_kagawad_meeting_participation_summary_unchecked;
revoke all on function public.get_kagawad_meeting_participation_summary_unchecked(uuid)
  from public, anon, authenticated;

create function public.get_kagawad_meeting_participation_summary(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tenant_plan_feature_enabled(p_barangay_id, 'core_services') then
    raise exception 'not authorized';
  end if;

  return public.get_kagawad_meeting_participation_summary_unchecked(p_barangay_id);
end;
$$;

revoke all on function public.get_kagawad_meeting_participation_summary(uuid) from public, anon;
grant execute on function public.get_kagawad_meeting_participation_summary(uuid) to authenticated;

