-- Resolve an approved, owner-scoped resolution notice to its meeting page.
create or replace function public.list_my_meeting_resolution_notification_details(p_resolution_ids uuid[])
returns table (resolution_id uuid, meeting_id uuid, page_number integer)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked_meetings as (
    select meeting.id, meeting.barangay_id,
      ((row_number() over (partition by meeting.barangay_id order by meeting.starts_at desc, meeting.id desc) - 1) / 20)::integer as page_number
    from public.meetings meeting
    where public.has_tenant_permission(meeting.barangay_id, 'meeting.read')
      or public.is_meeting_attendee(meeting.id)
  )
  select resolution.id, meeting.id, meeting.page_number
  from public.meeting_resolutions resolution
  join ranked_meetings meeting
    on meeting.id = resolution.meeting_id and meeting.barangay_id = resolution.barangay_id
  where resolution.id = any(coalesce(p_resolution_ids, '{}'::uuid[]))
    and resolution.proposed_by = (select auth.uid())
    and resolution.status = 'approved'
    and public.is_active_member(resolution.barangay_id);
$$;

revoke all on function public.list_my_meeting_resolution_notification_details(uuid[]) from public, anon;
grant execute on function public.list_my_meeting_resolution_notification_details(uuid[]) to authenticated;
