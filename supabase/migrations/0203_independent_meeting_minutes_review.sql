-- Preserve who prepared minutes separately from the latest editor/reviewer.
alter table public.meeting_minutes
  add column if not exists drafted_by uuid references public.profiles(id) on delete restrict;

update public.meeting_minutes minutes
set drafted_by = coalesce(
  (
    select event.actor_id
    from public.meeting_record_events event
    where event.minutes_id = minutes.id
      and event.action = 'minutes_saved'
    order by event.created_at desc, event.id desc
    limit 1
  ),
  minutes.updated_by
)
where minutes.drafted_by is null;

alter table public.meeting_minutes
  alter column drafted_by set not null;

create or replace function public.save_meeting_minutes(
  p_meeting_id uuid,
  p_content text,
  p_reviewed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meeting public.meetings%rowtype;
  v_minutes public.meeting_minutes%rowtype;
  v_minutes_found boolean := false;
  v_status text;
  v_action text;
  v_from_status text;
begin
  select * into v_meeting
  from public.meetings
  where id = p_meeting_id
  for update;

  if not found or not public.has_tenant_permission(v_meeting.barangay_id, 'meeting.manage') then
    raise exception 'not authorized';
  end if;
  if length(coalesce(p_content, '')) > 100000
    or (p_reviewed and length(trim(coalesce(p_content, ''))) < 3) then
    raise exception 'invalid meeting minutes';
  end if;

  select * into v_minutes
  from public.meeting_minutes
  where meeting_id = p_meeting_id
  for update;
  v_minutes_found := found;
  v_from_status := case when v_minutes_found then v_minutes.status else null end;

  if p_reviewed then
    if not v_minutes_found or v_minutes.status <> 'draft' then
      raise exception 'save the minutes as a draft before review';
    end if;
    if v_minutes.drafted_by = (select auth.uid()) then
      raise exception 'another meeting manager must review these minutes';
    end if;
  end if;

  v_status := case when p_reviewed then 'reviewed' else 'draft' end;
  v_action := case when p_reviewed then 'minutes_reviewed' else 'minutes_saved' end;

  insert into public.meeting_minutes as existing_minutes(barangay_id, meeting_id, content, status, updated_by, drafted_by)
  values (
    v_meeting.barangay_id,
    p_meeting_id,
    coalesce(p_content, ''),
    v_status,
    (select auth.uid()),
    (select auth.uid())
  )
  on conflict (meeting_id) do update set
    content = excluded.content,
    status = excluded.status,
    updated_by = excluded.updated_by,
    drafted_by = case when p_reviewed then existing_minutes.drafted_by else excluded.drafted_by end,
    updated_at = now()
  returning id into v_minutes.id;

  insert into public.meeting_record_events(barangay_id, meeting_id, minutes_id, actor_id, action, from_status, to_status)
  values (
    v_meeting.barangay_id,
    p_meeting_id,
    v_minutes.id,
    (select auth.uid()),
    v_action,
    v_from_status,
    v_status
  );

  return v_minutes.id;
end;
$$;

revoke all on function public.save_meeting_minutes(uuid, text, boolean) from public, anon;
grant execute on function public.save_meeting_minutes(uuid, text, boolean) to authenticated;
