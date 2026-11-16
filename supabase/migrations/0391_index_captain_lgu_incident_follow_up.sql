-- Speed up per-barangay Captain follow-up totals without indexing completed
-- handoffs that are not part of the active follow-up queue.
create index if not exists lgu_incident_escalations_captain_follow_up_idx
  on public.lgu_incident_escalations(barangay_id,status)
  where status in ('pending','acknowledged');
