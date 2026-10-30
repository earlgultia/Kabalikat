-- Return only the caller's private feedback and event history for a personal
-- data export, even if the caller also has staff access to the wider queue.
create or replace function public.get_own_community_feedback_export(p_barangay_id uuid)
returns table (
  id uuid,
  category text,
  subject text,
  message text,
  status text,
  staff_response text,
  created_at timestamptz,
  updated_at timestamptz,
  history jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
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
    and f.submitted_by = (select auth.uid());
$$;

revoke all on function public.get_own_community_feedback_export(uuid) from public, anon;
grant execute on function public.get_own_community_feedback_export(uuid) to authenticated;
