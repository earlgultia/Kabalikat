-- Disable legacy Kagawad list RPCs unused by the current application. The
-- current app uses plan-gated endpoints where replacements are available;
-- revoke these stale grants so callers cannot bypass the entitlement checks.

revoke all on function public.list_kagawad_invited_meetings(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.list_kagawad_meeting_invitation_response_history(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.list_kagawad_meeting_attendance_history(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.list_kagawad_attendance_correction_requests(uuid, integer, integer)
  from public, anon, authenticated;

revoke all on function public.list_kagawad_task_assignment_history(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.list_kagawad_completed_work_history(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.list_kagawad_task_due_date_request(uuid)
  from public, anon, authenticated;

