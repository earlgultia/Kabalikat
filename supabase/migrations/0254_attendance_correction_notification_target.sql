-- Resolve a correction alert to the requester's history or the reviewer's queue.
create or replace function public.get_attendance_correction_notification_target(p_request_id uuid)
returns table (
  is_requester boolean,
  page_index integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
  v_requester_id uuid;
  v_status text;
  v_created_at timestamptz;
  v_position bigint;
begin
  select request.barangay_id, request.requester_id, request.status, request.created_at
    into v_barangay_id, v_requester_id, v_status, v_created_at
  from public.meeting_attendance_correction_requests request
  where request.id = p_request_id;

  if v_barangay_id is null or not public.is_active_member(v_barangay_id) then
    raise exception 'not authorized';
  end if;

  if v_requester_id = (select auth.uid()) then
    select count(*) into v_position
    from public.meeting_attendance_correction_requests request
    where request.barangay_id = v_barangay_id
      and request.requester_id = v_requester_id
      and (request.created_at, request.id) > (v_created_at, p_request_id);
    return query select true, (v_position / 10)::integer;
    return;
  end if;

  if not public.has_tenant_permission(v_barangay_id, 'attendance.manage') then
    raise exception 'not authorized';
  end if;

  if v_status <> 'pending' then
    return query select false, 0;
    return;
  end if;

  select count(*) into v_position
  from public.meeting_attendance_correction_requests request
  where request.barangay_id = v_barangay_id
    and request.status = 'pending'
    and (request.created_at, request.id) < (v_created_at, p_request_id);

  return query select false, (v_position / 10)::integer;
end;
$$;

revoke all on function public.get_attendance_correction_notification_target(uuid) from public, anon;
grant execute on function public.get_attendance_correction_notification_target(uuid) to authenticated;
