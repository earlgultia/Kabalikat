-- Restore authenticated access paths used by RLS checks and private audit reads.
grant execute on function public.tenant_plan_feature_enabled(uuid, text) to authenticated;

grant select (id, barangay_id, request_id, action, reason, created_at)
  on public.resident_profile_change_events to authenticated;

create or replace function public.can_read_community_feedback(
  p_feedback_id uuid,
  p_barangay_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_feedback feedback
    where feedback.id = p_feedback_id
      and feedback.barangay_id = p_barangay_id
      and (
        feedback.submitted_by = (select auth.uid())
        or public.has_tenant_permission(feedback.barangay_id, 'community.feedback.manage')
      )
  );
$$;

revoke all on function public.can_read_community_feedback(uuid, uuid) from public, anon;
grant execute on function public.can_read_community_feedback(uuid, uuid) to authenticated;

drop policy if exists community_feedback_events_read on public.community_feedback_events;
create policy community_feedback_events_read on public.community_feedback_events
  for select to authenticated
  using (public.can_read_community_feedback(feedback_id, barangay_id));
