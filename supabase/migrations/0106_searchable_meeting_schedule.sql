-- Search meeting schedules on the server while preserving caller row-level security.
create index if not exists meetings_tenant_status_schedule_page_idx
  on public.meetings(barangay_id, status, starts_at desc, id desc);

create or replace function public.list_meeting_schedule_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  id uuid,
  title text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  agenda text,
  status text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'scheduled', 'completed', 'cancelled') then
    raise exception 'invalid meeting status filter';
  end if;

  return query
  with matching as (
    select meeting.id, meeting.title, meeting.location, meeting.starts_at,
      meeting.ends_at, meeting.agenda, meeting.status
    from public.meetings meeting
    where meeting.barangay_id = p_barangay_id
      and (v_status = 'all' or meeting.status = v_status)
      and (v_search is null or position(v_search in lower(concat_ws(' ',
        meeting.title, meeting.location, meeting.agenda
      ))) > 0)
  ), counted as (
    select matching.*, count(*) over () as total_count
    from matching
  )
  select counted.id, counted.title, counted.location, counted.starts_at,
    counted.ends_at, counted.agenda, counted.status, counted.total_count
  from counted
  order by counted.starts_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_meeting_schedule_page(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_meeting_schedule_page(uuid, integer, integer, text, text) to authenticated;
