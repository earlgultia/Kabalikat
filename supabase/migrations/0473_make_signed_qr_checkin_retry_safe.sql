-- A client can lose the response after the attendance and signature commit.
-- Treat a repeated request as successful only when the signed QR check-in was
-- already committed for this attendee and meeting.
create or replace function public.check_in_with_meeting_qr_signed(
  p_meeting_id uuid,
  p_token text,
  p_signature_path text
)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_meeting public.meetings%rowtype;
  v_record_id uuid;
  v_signature text := trim(coalesce(p_signature_path, ''));
begin
  if auth.uid() is null or length(coalesce(p_token, '')) <> 64 then
    raise exception 'invalid or expired attendance code';
  end if;
  if length(v_signature) not between 10 and 20000
    or v_signature !~ '^[ML0-9., -]+$'
    or v_signature !~ 'M.*L' then
    raise exception 'draw your signature before checking in';
  end if;

  select meeting.* into v_meeting
  from public.meetings meeting
  join public.meeting_attendance_tokens token
    on token.meeting_id = meeting.id and token.barangay_id = meeting.barangay_id
  where meeting.id = p_meeting_id
    and token.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and token.revoked_at is null and token.expires_at > now()
  for share of meeting;
  if not found then raise exception 'invalid or expired attendance code'; end if;
  if v_meeting.status <> 'scheduled'
    or now() < v_meeting.starts_at - interval '30 minutes'
    or now() > coalesce(v_meeting.ends_at, v_meeting.starts_at + interval '4 hours') + interval '30 minutes' then
    raise exception 'attendance window is closed';
  end if;
  if not exists (
    select 1 from public.meeting_attendees attendee
    join public.barangay_memberships membership
      on membership.user_id = attendee.user_id and membership.barangay_id = attendee.barangay_id
    where attendee.meeting_id = p_meeting_id and attendee.user_id = auth.uid() and membership.status = 'active'
  ) then raise exception 'you are not an eligible attendee'; end if;

  insert into public.attendance_records(meeting_id, barangay_id, user_id, status, source, recorded_by)
  values (p_meeting_id, v_meeting.barangay_id, auth.uid(), 'present', 'qr_checkin', auth.uid())
  on conflict (meeting_id, user_id) do nothing returning id into v_record_id;
  if v_record_id is null then
    if exists (
      select 1 from public.meeting_attendance_signatures signature
      where signature.meeting_id = p_meeting_id and signature.user_id = auth.uid()
    ) then
      return;
    end if;
    raise exception 'attendance is already recorded';
  end if;

  insert into public.meeting_attendance_signatures(meeting_id, barangay_id, user_id, signature_path)
  values (p_meeting_id, v_meeting.barangay_id, auth.uid(), v_signature);
  insert into public.attendance_events(meeting_id, barangay_id, user_id, actor_id, to_status, reason)
  values (p_meeting_id, v_meeting.barangay_id, auth.uid(), auth.uid(), 'present', 'QR check-in');
end;
$$;

revoke all on function public.check_in_with_meeting_qr_signed(uuid, text, text) from public, anon;
grant execute on function public.check_in_with_meeting_qr_signed(uuid, text, text) to authenticated;
