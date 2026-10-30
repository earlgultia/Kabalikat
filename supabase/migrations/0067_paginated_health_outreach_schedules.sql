-- Support stable, bounded paging of tenant health outreach schedules.
create index if not exists health_outreach_tenant_schedule_page_idx
  on public.health_outreach_campaigns(barangay_id, starts_at, id);
