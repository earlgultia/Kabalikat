-- Allow an active invited Kagawad to view the agenda for their own upcoming meeting.
create or replace function public.get_kagawad_invited_meeting_agenda(p_meeting_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_agenda text;
begin
  select meeting.agenda into v_agenda
  from public.meetings meeting
  where meeting.id = p_meeting_id
    and meeting.status = 'scheduled'
    and meeting.starts_at > now()
    and exists (
      select 1
      from public.meeting_attendees attendee
      where attendee.meeting_id = meeting.id
        and attendee.barangay_id = meeting.barangay_id
        and attendee.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = meeting.barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    );

  if not found then
    raise exception 'not authorized';
  end if;

  return coalesce(v_agenda, '');
end;
$$;

revoke all on function public.get_kagawad_invited_meeting_agenda(uuid) from public, anon;
grant execute on function public.get_kagawad_invited_meeting_agenda(uuid) to authenticated;
