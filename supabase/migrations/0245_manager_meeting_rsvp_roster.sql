-- Let meeting and attendance managers review individual invited-member RSVPs.
create or replace function public.list_meeting_invitation_response_roster(
  p_meeting_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_response text default 'all',
  p_search text default null
)
returns table (
  user_id uuid,
  display_name text,
  role_label text,
  response text,
  responded_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_response text := coalesce(nullif(p_response, ''), 'all');
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_barangay_id uuid;
begin
  if v_response not in ('all', 'attending', 'unavailable', 'no_response') then
    raise exception 'invalid invitation response filter';
  end if;

  select meeting.barangay_id into v_barangay_id
  from public.meetings meeting
  where meeting.id = p_meeting_id;

  if v_barangay_id is null
    or not (public.has_tenant_permission(v_barangay_id, 'meeting.manage')
      or public.has_tenant_permission(v_barangay_id, 'attendance.manage')) then
    raise exception 'not authorized';
  end if;

  return query
  with roster as (
    select membership.user_id, profile.display_name, role.label as role_label,
      response.response, response.responded_at
    from public.meeting_attendees attendee
    join public.barangay_memberships membership
      on membership.user_id = attendee.user_id
     and membership.barangay_id = attendee.barangay_id
     and membership.status = 'active'
    join public.profiles profile on profile.id = membership.user_id
    join public.role_definitions role on role.id = membership.role_id
    left join public.meeting_invitation_responses response
      on response.meeting_id = attendee.meeting_id
     and response.barangay_id = attendee.barangay_id
     and response.user_id = attendee.user_id
    where attendee.meeting_id = p_meeting_id
      and attendee.barangay_id = v_barangay_id
      and (v_response = 'all'
        or (v_response = 'no_response' and response.response is null)
        or response.response = v_response)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', profile.display_name, role.label))) > 0)
  ), counted as (
    select roster.*, count(*) over () as total_count from roster
  )
  select counted.user_id, counted.display_name, counted.role_label,
    counted.response, counted.responded_at, counted.total_count
  from counted
  order by counted.display_name, counted.user_id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_meeting_invitation_response_roster(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_meeting_invitation_response_roster(uuid, integer, integer, text, text) to authenticated;
