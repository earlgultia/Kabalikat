-- Support account-erasure cleanup lookups on large tenant history tables.
create index if not exists committee_task_assignment_events_assigned_by_erasure_idx
  on public.committee_task_assignment_events (assigned_by)
  where assigned_by is not null;
create index if not exists committee_task_assignment_events_previous_assignee_erasure_idx
  on public.committee_task_assignment_events (previous_assignee)
  where previous_assignee is not null;
create index if not exists issued_documents_issued_by_erasure_idx
  on public.issued_documents (issued_by);
create index if not exists platform_activity_events_actor_erasure_idx
  on public.platform_activity_events (actor_id)
  where actor_id is not null;
create index if not exists document_request_events_actor_erasure_idx
  on public.document_request_events (actor_id);
create index if not exists finance_budget_amendments_requester_erasure_idx
  on public.finance_budget_amendments (requested_by);
create index if not exists financial_adjustments_requester_erasure_idx
  on public.financial_adjustments (requested_by);
create index if not exists financial_events_actor_erasure_idx
  on public.financial_events (actor_id);
create index if not exists committee_events_actor_erasure_idx
  on public.committee_events (actor_id);
create index if not exists sk_project_events_actor_erasure_idx
  on public.sk_project_events (actor_id);
create index if not exists barangay_project_events_actor_erasure_idx
  on public.barangay_project_events (actor_id);
create index if not exists health_outreach_events_actor_erasure_idx
  on public.health_outreach_events (actor_id);
create index if not exists sk_event_events_actor_erasure_idx
  on public.sk_event_events (actor_id);
create index if not exists subscription_events_actor_erasure_idx
  on public.subscription_events (actor_id);
create index if not exists issued_document_events_actor_erasure_idx
  on public.issued_document_events (actor_id);
create index if not exists platform_lgu_workspace_status_events_actor_erasure_idx
  on public.platform_lgu_workspace_status_events (actor_id);
create index if not exists archive_upload_intents_creator_erasure_idx
  on public.archive_upload_intents (created_by);
create index if not exists financial_receipt_upload_intents_creator_erasure_idx
  on public.financial_receipt_upload_intents (created_by);
create index if not exists incident_evidence_upload_intents_creator_erasure_idx
  on public.incident_evidence_upload_intents (created_by);
