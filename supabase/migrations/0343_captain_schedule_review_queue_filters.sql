-- Match Captain dashboard schedule-review counts: drafts and returned items
-- created by another account, in both Health Outreach and SK Events.

create or replace function public.list_health_outreach_campaigns_in_window(
  p_barangay_id uuid,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_status text,
  p_starts_after timestamptz,
  p_starts_before timestamptz,
  p_own_only boolean default false
) returns table (
  id uuid, barangay_id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, status text, created_by uuid,
  created_at timestamptz, reviewed_by uuid, reviewed_at timestamptz,
  review_note text, completed_at timestamptz, attendance_count integer,
  cancellation_reason text, total_count bigint
) language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'changes_requested', 'review_queue', 'published', 'completed', 'cancelled') then
    raise exception 'invalid health outreach status filter';
  end if;
  if p_starts_after is not null and p_starts_before is not null and p_starts_before <= p_starts_after then
    raise exception 'end of date range must be after its start';
  end if;

  return query
  with matching as (
    select campaign.id, campaign.barangay_id, campaign.title, campaign.description, campaign.location,
      campaign.starts_at, campaign.ends_at, campaign.status, campaign.created_by, campaign.created_at,
      campaign.reviewed_by, campaign.reviewed_at, campaign.review_note, campaign.completed_at,
      campaign.attendance_count, campaign.cancellation_reason
    from public.health_outreach_campaigns campaign
    where campaign.barangay_id = p_barangay_id
      and (not coalesce(p_own_only, false) or campaign.created_by = (select auth.uid()))
      and (
        v_status = 'all'
        or campaign.status = v_status
        or (v_status = 'review_queue'
          and campaign.status in ('draft', 'changes_requested')
          and campaign.created_by <> (select auth.uid()))
      )
      and (p_starts_after is null or campaign.starts_at >= p_starts_after)
      and (p_starts_before is null or campaign.starts_at < p_starts_before)
      and (v_search is null or position(v_search in lower(concat_ws(' ', campaign.title, campaign.description, campaign.location))) > 0)
  ), counted as (
    select matching.*, count(*) over () as total_count from matching
  )
  select counted.id, counted.barangay_id, counted.title, counted.description, counted.location,
    counted.starts_at, counted.ends_at, counted.status, counted.created_by, counted.created_at,
    counted.reviewed_by, counted.reviewed_at, counted.review_note, counted.completed_at,
    counted.attendance_count, counted.cancellation_reason, counted.total_count
  from counted
  order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

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
  if v_status not in ('all', 'draft', 'changes_requested', 'review_queue', 'published', 'completed', 'cancelled') then
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
