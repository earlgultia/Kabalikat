-- Row-level update/delete guards do not fire for TRUNCATE; reject that operation too.
drop trigger if exists platform_activity_events_prevent_truncate on public.platform_activity_events;
create trigger platform_activity_events_prevent_truncate
  before truncate on public.platform_activity_events
  for each statement execute function public.reject_platform_activity_event_mutation();
