-- Phase 3: short-lived, attendee-bound meeting QR check-in tokens.
create table public.meeting_attendance_tokens (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  meeting_id uuid not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (meeting_id, barangay_id) references public.meetings(id, barangay_id) on delete restrict
);
create index meeting_attendance_tokens_meeting_idx on public.meeting_attendance_tokens(meeting_id, expires_at desc);
alter table public.meeting_attendance_tokens enable row level security;

alter table public.attendance_records drop constraint if exists attendance_records_source_check;
alter table public.attendance_records add constraint attendance_records_source_check
  check (source in ('self_checkin','official','qr_checkin'));

create or replace function public.create_meeting_attendance_token(p_meeting_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare v_meeting public.meetings%rowtype; v_token text; v_expires_at timestamptz;
begin
  select * into v_meeting from public.meetings where id = p_meeting_id for update;
  if not found or not public.has_tenant_permission(v_meeting.barangay_id, 'attendance.manage') then
    raise exception 'not authorized';
  end if;
  if v_meeting.status <> 'scheduled'
    or now() < v_meeting.starts_at - interval '30 minutes'
    or now() > coalesce(v_meeting.ends_at, v_meeting.starts_at + interval '4 hours') + interval '30 minutes' then
    raise exception 'attendance window is closed';
  end if;
  v_expires_at := least(now() + interval '5 minutes', coalesce(v_meeting.ends_at, v_meeting.starts_at + interval '4 hours') + interval '30 minutes');
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.meeting_attendance_tokens set revoked_at = now()
    where meeting_id = p_meeting_id and revoked_at is null and expires_at > now();
  insert into public.meeting_attendance_tokens(barangay_id, meeting_id, token_hash, expires_at, created_by)
  values (v_meeting.barangay_id, p_meeting_id, extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), v_expires_at, auth.uid());
  return jsonb_build_object('token', v_token, 'expires_at', v_expires_at);
end;
$$;

create or replace function public.check_in_with_meeting_qr(p_meeting_id uuid, p_token text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_meeting public.meetings%rowtype; v_token_id uuid; v_record_id uuid;
begin
  if auth.uid() is null or length(coalesce(p_token, '')) <> 64 then raise exception 'invalid or expired attendance code'; end if;
  select m.* into v_meeting
  from public.meetings m
  join public.meeting_attendance_tokens t on t.meeting_id = m.id and t.barangay_id = m.barangay_id
  where m.id = p_meeting_id and t.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and t.revoked_at is null and t.expires_at > now()
  for share of m;
  if not found then raise exception 'invalid or expired attendance code'; end if;
  if v_meeting.status <> 'scheduled'
    or now() < v_meeting.starts_at - interval '30 minutes'
    or now() > coalesce(v_meeting.ends_at, v_meeting.starts_at + interval '4 hours') + interval '30 minutes' then
    raise exception 'attendance window is closed';
  end if;
  if not exists (
    select 1 from public.meeting_attendees a
    join public.barangay_memberships bm on bm.user_id = a.user_id and bm.barangay_id = a.barangay_id
    where a.meeting_id = p_meeting_id and a.user_id = auth.uid() and bm.status = 'active'
  ) then raise exception 'you are not an eligible attendee'; end if;
  insert into public.attendance_records(meeting_id, barangay_id, user_id, status, source, recorded_by)
  values (p_meeting_id, v_meeting.barangay_id, auth.uid(), 'present', 'qr_checkin', auth.uid())
  on conflict (meeting_id, user_id) do nothing returning id into v_record_id;
  if v_record_id is null then raise exception 'attendance is already recorded'; end if;
  insert into public.attendance_events(meeting_id, barangay_id, user_id, actor_id, to_status, reason)
  values (p_meeting_id, v_meeting.barangay_id, auth.uid(), auth.uid(), 'present', 'QR check-in');
end;
$$;

revoke all on public.meeting_attendance_tokens from anon, authenticated;
revoke all on function public.create_meeting_attendance_token(uuid) from public, anon;
revoke all on function public.check_in_with_meeting_qr(uuid,text) from public, anon;
grant execute on function public.create_meeting_attendance_token(uuid) to authenticated;
grant execute on function public.check_in_with_meeting_qr(uuid,text) to authenticated;
