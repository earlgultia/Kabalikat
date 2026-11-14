-- Keep the upcoming-meetings dashboard shortcut on the same database clock as its count.
create or replace function public.list_meeting_schedule_page_in_window(
  p_barangay_id uuid, p_page integer, p_page_size integer, p_search text, p_status text,
  p_starts_after timestamptz, p_starts_before timestamptz
) returns table (
  id uuid, title text, location text, starts_at timestamptz, ends_at timestamptz,
  agenda text, status text, total_count bigint
) language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'scheduled', 'upcoming', 'completed', 'cancelled') then
    raise exception 'invalid meeting status filter';
  end if;
  if p_starts_after is not null and p_starts_before is not null and p_starts_before <= p_starts_after then
    raise exception 'end of date range must be after its start';
  end if;

  return query
  with matching as (
    select meeting.id, meeting.title, meeting.location, meeting.starts_at,
      meeting.ends_at, meeting.agenda, meeting.status
    from public.meetings meeting
    where meeting.barangay_id = p_barangay_id
      and (
        v_status = 'all'
        or meeting.status = v_status
        or (v_status = 'upcoming' and meeting.status = 'scheduled' and meeting.starts_at >= now())
      )
      and (p_starts_after is null or meeting.starts_at >= p_starts_after)
      and (p_starts_before is null or meeting.starts_at < p_starts_before)
      and (v_search is null or position(v_search in lower(concat_ws(' ', meeting.title, meeting.location, meeting.agenda))) > 0)
  ), counted as (
    select matching.*, count(*) over () as total_count from matching
  )
  select counted.id, counted.title, counted.location, counted.starts_at,
    counted.ends_at, counted.agenda, counted.status, counted.total_count
  from counted order by counted.starts_at desc, counted.id desc
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;
revoke all on function public.list_meeting_schedule_page_in_window(uuid, integer, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.list_meeting_schedule_page_in_window(uuid, integer, integer, text, text, timestamptz, timestamptz) to authenticated;
