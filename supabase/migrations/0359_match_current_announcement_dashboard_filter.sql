-- Add a database-clock current-announcements filter matching the dashboard count.
create or replace function public.list_announcement_page_in_window(
  p_barangay_id uuid, p_page integer, p_page_size integer, p_search text, p_status text,
  p_created_after timestamptz, p_created_before timestamptz
) returns table (
  id uuid, title text, body text, audience text, audience_role_id uuid, status text,
  published_at timestamptz, expires_at timestamptz, created_at timestamptz, total_count bigint
) language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'published', 'archived', 'current') then
    raise exception 'invalid announcement status filter';
  end if;
  if p_created_after is not null and p_created_before is not null and p_created_before <= p_created_after then
    raise exception 'end of creation date range must be after its start';
  end if;

  return query
  with matching as (
    select announcement.id, announcement.title, announcement.body, announcement.audience::text as audience,
      announcement.audience_role_id, announcement.status::text as status, announcement.published_at,
      announcement.expires_at, announcement.created_at
    from public.announcements announcement
    where announcement.barangay_id = p_barangay_id
      and ((v_status = 'current' and announcement.status = 'published'
        and (announcement.expires_at is null or announcement.expires_at > now()))
        or (v_status <> 'current' and (v_status = 'all' or announcement.status::text = v_status)))
      and (p_created_after is null or announcement.created_at >= p_created_after)
      and (p_created_before is null or announcement.created_at < p_created_before)
      and (v_search is null or position(v_search in lower(concat_ws(' ', announcement.title, announcement.body))) > 0)
  ), counted as (
    select matching.*, count(*) over () as total_count from matching
  )
  select counted.id, counted.title, counted.body, counted.audience, counted.audience_role_id,
    counted.status, counted.published_at, counted.expires_at, counted.created_at, counted.total_count
  from counted order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;
revoke all on function public.list_announcement_page_in_window(uuid, integer, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.list_announcement_page_in_window(uuid, integer, integer, text, text, timestamptz, timestamptz) to authenticated;
