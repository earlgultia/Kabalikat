-- Ensure each municipal incident escalation belongs to the LGU that owns its
-- barangay, even if a future privileged function supplies mismatched IDs.
alter table public.barangays
  add constraint barangays_lgu_id_id_unique unique (lgu_id,id);

alter table public.lgu_incident_escalations
  add constraint lgu_incident_escalations_barangay_owner_fk
  foreign key (lgu_id,barangay_id)
  references public.barangays(lgu_id,id)
  on delete restrict;
