-- Keep the Captain's SK accomplishment shortcut on the same submitted-by-
-- another-user records counted by get_captain_review_queue_summary.
create or replace function public.list_captain_sk_accomplishment_review_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20
)
returns table (
  id uuid,
  project_id uuid,
  title text,
  summary text,
  status text,
  created_by uuid,
  created_at timestamptz,
  published_at timestamptz,
  review_note text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
begin
  if not public.has_tenant_permission(p_barangay_id, 'sk.review') then
    raise exception 'not authorized';
  end if;

  return query
  with matching as (
    select accomplishment.id, accomplishment.project_id,
      accomplishment.title, accomplishment.summary, accomplishment.status,
      accomplishment.created_by, accomplishment.created_at,
      accomplishment.published_at, accomplishment.review_note
    from public.sk_public_accomplishments accomplishment
    where accomplishment.barangay_id = p_barangay_id
      and accomplishment.status = 'submitted'
      and accomplishment.created_by <> (select auth.uid())
  ), counted as (
    select matching.*, count(*) over () as total_count
    from matching
  )
  select counted.id, counted.project_id, counted.title, counted.summary,
    counted.status, counted.created_by, counted.created_at,
    counted.published_at, counted.review_note, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_captain_sk_accomplishment_review_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_captain_sk_accomplishment_review_page(uuid, integer, integer) to authenticated;
