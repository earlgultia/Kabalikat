-- The app now uses searchable, plan-gated history RPCs for these views.
-- Revoke the older paginated endpoints so they cannot bypass those gates.
revoke all on function public.list_kagawad_task_assignment_history(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.list_kagawad_completed_work_history(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.list_kagawad_meeting_attendance_history(uuid, integer, integer)
  from public, anon, authenticated;
