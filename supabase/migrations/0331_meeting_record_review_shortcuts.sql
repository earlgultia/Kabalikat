-- Let authorized meeting managers open a meeting that has records awaiting another reviewer.
create or replace function public.get_meeting_record_review_target(
  p_barangay_id uuid,
  p_kind text
)
returns table (meeting_id uuid, page_number integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_kind is null or p_kind not in ('minutes', 'resolutions') then
    raise exception 'invalid meeting record review kind';
  end if;

  if not public.is_active_member(p_barangay_id)
    or not public.has_tenant_permission(p_barangay_id, 'meeting.manage') then
    raise exception 'not authorized';
  end if;

  return query
  with ranked_meetings as (
    select meeting.id,
      ((row_number() over (order by meeting.starts_at desc, meeting.id desc) - 1) / 20)::integer as page_number
    from public.meetings meeting
    where meeting.barangay_id = p_barangay_id
  ), pending_meeting_records as (
    select minutes.meeting_id, minutes.updated_at as pending_at
    from public.meeting_minutes minutes
    where p_kind = 'minutes'
      and minutes.barangay_id = p_barangay_id
      and minutes.status = 'draft'
      and minutes.drafted_by <> (select auth.uid())
    union all
    select resolution.meeting_id, resolution.updated_at as pending_at
    from public.meeting_resolutions resolution
    where p_kind = 'resolutions'
      and resolution.barangay_id = p_barangay_id
      and resolution.status = 'draft'
      and resolution.proposed_by <> (select auth.uid())
  )
  select ranked.id, ranked.page_number
  from pending_meeting_records pending
  join ranked_meetings ranked on ranked.id = pending.meeting_id
  order by pending.pending_at desc, ranked.id desc
  limit 1;
end;
$$;

revoke all on function public.get_meeting_record_review_target(uuid, text) from public, anon;
grant execute on function public.get_meeting_record_review_target(uuid, text) to authenticated;
