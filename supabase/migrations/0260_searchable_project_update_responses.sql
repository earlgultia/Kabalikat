-- Let workspace members search project update response history without
-- bypassing the existing response visibility check.
drop function if exists public.list_barangay_project_update_response_page(uuid, integer, integer);

create function public.list_barangay_project_update_response_page(
  p_update_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_created_after date default null,
  p_created_before date default null
)
returns table (
  id uuid,
  author_name text,
  content text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if p_created_after is not null and p_created_before is not null
    and p_created_after > p_created_before then
    raise exception 'start date must be on or before end date';
  end if;

  select update_record.barangay_id into v_barangay_id
  from public.barangay_project_updates update_record
  where update_record.id = p_update_id;

  if v_barangay_id is null
    or not public.can_access_barangay_project_update_responses(p_update_id, v_barangay_id) then
    raise exception 'not authorized';
  end if;

  return query
  select response.id,
    coalesce(nullif(profile.display_name, ''), 'Workspace member'),
    response.content,
    response.created_at,
    count(*) over ()
  from public.barangay_project_update_responses response
  join public.profiles profile on profile.id = response.author_id
  where response.update_id = p_update_id
    and response.barangay_id = v_barangay_id
    and (v_search is null
      or profile.display_name ilike '%' || v_search || '%'
      or response.content ilike '%' || v_search || '%')
    and (p_created_after is null or response.created_at >= p_created_after::timestamptz)
    and (p_created_before is null or response.created_at < (p_created_before + 1)::timestamptz)
  order by response.created_at, response.id
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;

revoke all on function public.list_barangay_project_update_response_page(uuid, integer, integer, text, date, date) from public, anon;
grant execute on function public.list_barangay_project_update_response_page(uuid, integer, integer, text, date, date) to authenticated;
