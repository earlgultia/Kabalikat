-- Preserve the evidence event added by 0028 when 0031 adds external escalation.
-- This forward migration repairs databases where 0031 was already applied.
alter table public.incident_events drop constraint if exists incident_events_action_check;
alter table public.incident_events add constraint incident_events_action_check
  check (action in ('submitted','assigned','acknowledged','started','resolved','closed','response_update','evidence_attached','escalated'));
