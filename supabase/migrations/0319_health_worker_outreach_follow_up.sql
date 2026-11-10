-- Give Health Workers private counts for their submitted and returned schedules.
create index if not exists health_outreach_creator_follow_up_idx
  on public.health_outreach_campaigns(barangay_id, created_by, status, starts_at);

create or replace function public.get_health_worker_outreach_follow_up(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_awaiting_review bigint;
  v_changes_requested bigint;
  v_upcoming_published bigint;
begin
  if not public.is_active_member(p_barangay_id)
    or not public.has_tenant_permission(p_barangay_id, 'health.campaign.manage') then
    raise exception 'not authorized';
  end if;

  select count(*) into v_awaiting_review
  from public.health_outreach_campaigns campaign
  where campaign.barangay_id = p_barangay_id
    and campaign.created_by = (select auth.uid())
    and campaign.status = 'draft';

  select count(*) into v_changes_requested
  from public.health_outreach_campaigns campaign
  where campaign.barangay_id = p_barangay_id
    and campaign.created_by = (select auth.uid())
    and campaign.status = 'changes_requested';

  select count(*) into v_upcoming_published
  from public.health_outreach_campaigns campaign
  where campaign.barangay_id = p_barangay_id
    and campaign.created_by = (select auth.uid())
    and campaign.status = 'published'
    and campaign.starts_at >= now();

  return jsonb_build_object(
    'schedules_awaiting_review', v_awaiting_review,
    'schedules_to_revise', v_changes_requested,
    'upcoming_published_outreaches', v_upcoming_published,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_health_worker_outreach_follow_up(uuid) from public, anon;
grant execute on function public.get_health_worker_outreach_follow_up(uuid) to authenticated;
