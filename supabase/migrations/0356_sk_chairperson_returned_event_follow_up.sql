-- Give SK Chairpersons a count and private shortcut for event schedules they
-- need to revise after the Captain requests changes.
create or replace function public.list_sk_event_page_in_window(
  p_barangay_id uuid, p_page integer, p_page_size integer, p_search text, p_status text,
  p_starts_after timestamptz, p_starts_before timestamptz
) returns table (
  id uuid, barangay_id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, status text, created_by uuid,
  created_at timestamptz, reviewed_by uuid, reviewed_at timestamptz,
  review_note text, completed_at timestamptz, total_count bigint
) language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'my_drafts', 'my_changes_requested', 'changes_requested', 'review_queue', 'published', 'completed', 'cancelled') then
    raise exception 'invalid SK event status filter';
  end if;
  if p_starts_after is not null and p_starts_before is not null and p_starts_before <= p_starts_after then
    raise exception 'end of date range must be after its start';
  end if;

  return query
  with matching as (
    select event.id, event.barangay_id, event.title, event.description, event.location,
      event.starts_at, event.ends_at, event.status, event.created_by, event.created_at,
      event.reviewed_by, event.reviewed_at, event.review_note, event.completed_at
    from public.sk_events event
    where event.barangay_id = p_barangay_id
      and (
        v_status = 'all'
        or event.status = v_status
        or (v_status = 'my_drafts' and event.status = 'draft' and event.created_by = (select auth.uid()))
        or (v_status = 'my_changes_requested' and event.status = 'changes_requested' and event.created_by = (select auth.uid()))
        or (v_status = 'review_queue'
          and event.status in ('draft', 'changes_requested')
          and event.created_by <> (select auth.uid()))
      )
      and (p_starts_after is null or event.starts_at >= p_starts_after)
      and (p_starts_before is null or event.starts_at < p_starts_before)
      and (v_search is null or position(v_search in lower(concat_ws(' ', event.title, event.description, event.location))) > 0)
  ), counted as (
    select matching.*, count(*) over () as total_count from matching
  )
  select counted.id, counted.barangay_id, counted.title, counted.description, counted.location,
    counted.starts_at, counted.ends_at, counted.status, counted.created_by, counted.created_at,
    counted.reviewed_by, counted.reviewed_at, counted.review_note, counted.completed_at, counted.total_count
  from counted
  order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_sk_event_page_in_window(uuid, integer, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.list_sk_event_page_in_window(uuid, integer, integer, text, text, timestamptz, timestamptz) to authenticated;

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
  v_events_to_revise bigint;
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

    select count(*) into v_events_to_revise
    from public.sk_events event_record
    where event_record.barangay_id = p_barangay_id
      and event_record.created_by = (select auth.uid())
      and event_record.status = 'changes_requested';
  end if;

  return jsonb_build_object(
    'project_proposals_awaiting_review', v_projects,
    'event_schedules_awaiting_review', v_events,
    'event_schedules_to_revise', v_events_to_revise,
    'accomplishments_awaiting_review', v_accomplishments,
    'returned_accomplishments', v_returned_accomplishments,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_sk_chairperson_submission_follow_up(uuid) from public, anon;
grant execute on function public.get_sk_chairperson_submission_follow_up(uuid) to authenticated;
