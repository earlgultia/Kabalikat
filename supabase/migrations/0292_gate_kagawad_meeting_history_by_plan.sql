-- Gate Kagawad RSVP, attendance, and correction-history searches by the
-- core-services entitlement while retaining existing caller-specific checks.

alter function public.search_kagawad_meeting_rsvp_history(uuid, integer, integer, text, text, date, date)
  rename to search_kagawad_meeting_rsvp_history_unchecked;
revoke all on function public.search_kagawad_meeting_rsvp_history_unchecked(uuid, integer, integer, text, text, date, date)
  from public, anon, authenticated;

create function public.search_kagawad_meeting_rsvp_history(
  p_barangay_id uuid,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_response text,
  p_meeting_date_after date,
  p_meeting_date_before date
)
returns table (
  id uuid,
  meeting_id uuid,
  meeting_title text,
  meeting_starts_at timestamptz,
  response text,
  responded_at timestamptz,
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
  select * from public.search_kagawad_meeting_rsvp_history_unchecked(
    p_barangay_id, p_page, p_page_size, p_search, p_response,
    p_meeting_date_after, p_meeting_date_before
  );
end;
$$;

revoke all on function public.search_kagawad_meeting_rsvp_history(uuid, integer, integer, text, text, date, date)
  from public, anon;
grant execute on function public.search_kagawad_meeting_rsvp_history(uuid, integer, integer, text, text, date, date)
  to authenticated;

alter function public.search_kagawad_meeting_attendance_history(uuid, integer, integer, text, text, date, date)
  rename to search_kagawad_meeting_attendance_history_unchecked;
revoke all on function public.search_kagawad_meeting_attendance_history_unchecked(uuid, integer, integer, text, text, date, date)
  from public, anon, authenticated;

create function public.search_kagawad_meeting_attendance_history(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_attendance_status text default 'all',
  p_meeting_date_after date default null,
  p_meeting_date_before date default null
)
returns table (
  meeting_id uuid,
  title text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  meeting_status text,
  attendance_status text,
  attendance_recorded_at timestamptz,
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
  select * from public.search_kagawad_meeting_attendance_history_unchecked(
    p_barangay_id, p_page, p_page_size, p_search, p_attendance_status,
    p_meeting_date_after, p_meeting_date_before
  );
end;
$$;

revoke all on function public.search_kagawad_meeting_attendance_history(uuid, integer, integer, text, text, date, date)
  from public, anon;
grant execute on function public.search_kagawad_meeting_attendance_history(uuid, integer, integer, text, text, date, date)
  to authenticated;

alter function public.search_kagawad_attendance_correction_requests(uuid, integer, integer, text, text, text, date, date)
  rename to search_kagawad_attendance_correction_requests_unchecked;
revoke all on function public.search_kagawad_attendance_correction_requests_unchecked(uuid, integer, integer, text, text, text, date, date)
  from public, anon, authenticated;

create function public.search_kagawad_attendance_correction_requests(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_status text default 'all',
  p_requested_attendance text default 'all',
  p_submitted_after date default null,
  p_submitted_before date default null
)
returns table (
  id uuid,
  meeting_id uuid,
  meeting_title text,
  meeting_starts_at timestamptz,
  requested_status text,
  current_status text,
  reason text,
  status text,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
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
  select * from public.search_kagawad_attendance_correction_requests_unchecked(
    p_barangay_id, p_page, p_page_size, p_search, p_status,
    p_requested_attendance, p_submitted_after, p_submitted_before
  );
end;
$$;

revoke all on function public.search_kagawad_attendance_correction_requests(uuid, integer, integer, text, text, text, date, date)
  from public, anon;
grant execute on function public.search_kagawad_attendance_correction_requests(uuid, integer, integer, text, text, text, date, date)
  to authenticated;

