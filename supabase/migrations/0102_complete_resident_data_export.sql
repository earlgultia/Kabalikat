-- Page the caller-owned feedback export so large personal data copies are complete.
create or replace function public.get_own_community_feedback_export_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 50
)
returns table (
  id uuid,
  category text,
  subject text,
  message text,
  status text,
  staff_response text,
  created_at timestamptz,
  updated_at timestamptz,
  history jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
begin
  return query
  with owned_feedback as (
    select f.id, f.category, f.subject, f.message, f.status, f.staff_response,
      f.created_at, f.updated_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'action', e.action,
          'note', e.note,
          'created_at', e.created_at
        ) order by e.created_at, e.id)
        from public.community_feedback_events e
        where e.feedback_id = f.id and e.barangay_id = f.barangay_id
      ), '[]'::jsonb) as history
    from public.community_feedback f
    where f.barangay_id = p_barangay_id
      and f.submitted_by = (select auth.uid())
  ), counted as (
    select owned_feedback.*, count(*) over () as total_count
    from owned_feedback
  )
  select counted.id, counted.category, counted.subject, counted.message,
    counted.status, counted.staff_response, counted.created_at, counted.updated_at,
    counted.history, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.get_own_community_feedback_export_page(uuid, integer, integer) from public, anon;
grant execute on function public.get_own_community_feedback_export_page(uuid, integer, integer) to authenticated;
