-- Give SK Chairpersons a private view of proposals awaiting review and
-- accomplishment summaries returned for revision in their own workspace.
create or replace function public.get_sk_chairperson_submission_follow_up(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_projects bigint;
  v_events bigint;
  v_accomplishments bigint;
  v_returned_accomplishments bigint;
begin
  if not public.is_active_member(p_barangay_id)
    or not (
      public.has_tenant_permission(p_barangay_id, 'sk.manage')
      or public.has_tenant_permission(p_barangay_id, 'sk.event.manage')
    ) then
    raise exception 'not authorized';
  end if;

  if public.has_tenant_permission(p_barangay_id, 'sk.manage') then
    select count(*) into v_projects
    from public.sk_projects project
    where project.barangay_id = p_barangay_id
      and project.created_by = (select auth.uid())
      and project.status = 'submitted';

    select count(*) into v_accomplishments
    from public.sk_public_accomplishments accomplishment
    where accomplishment.barangay_id = p_barangay_id
      and accomplishment.created_by = (select auth.uid())
      and accomplishment.status = 'submitted';

    select count(*) into v_returned_accomplishments
    from public.sk_public_accomplishments accomplishment
    where accomplishment.barangay_id = p_barangay_id
      and accomplishment.created_by = (select auth.uid())
      and accomplishment.status = 'returned';
  end if;

  if public.has_tenant_permission(p_barangay_id, 'sk.event.manage') then
    select count(*) into v_events
    from public.sk_events event_record
    where event_record.barangay_id = p_barangay_id
      and event_record.created_by = (select auth.uid())
      and event_record.status = 'draft';
  end if;

  return jsonb_build_object(
    'project_proposals_awaiting_review', v_projects,
    'event_schedules_awaiting_review', v_events,
    'accomplishments_awaiting_review', v_accomplishments,
    'returned_accomplishments', v_returned_accomplishments,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_sk_chairperson_submission_follow_up(uuid) from public, anon;
grant execute on function public.get_sk_chairperson_submission_follow_up(uuid) to authenticated;
