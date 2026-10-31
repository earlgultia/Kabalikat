-- Return only the roster for one meeting instead of loading the whole tenant directory.
create or replace function public.list_meeting_attendee_members(p_meeting_id uuid)
returns table (user_id uuid, display_name text, role_label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  select m.barangay_id into v_barangay_id
  from public.meetings m
  where m.id = p_meeting_id;

  if v_barangay_id is null or not public.has_tenant_permission(v_barangay_id, 'meeting.manage') then
    raise exception 'not authorized';
  end if;

  return query
  select a.user_id, coalesce(nullif(p.display_name, ''), 'Member'), membership.role_label
  from public.meeting_attendees a
  join public.profiles p on p.id = a.user_id
  left join lateral (
    select r.label as role_label
    from public.barangay_memberships bm
    join public.role_definitions r on r.id = bm.role_id
    where bm.user_id = a.user_id and bm.barangay_id = v_barangay_id and bm.status = 'active'
    order by bm.created_at desc, bm.id desc
    limit 1
  ) membership on true
  where a.meeting_id = p_meeting_id and a.barangay_id = v_barangay_id
  order by coalesce(nullif(p.display_name, ''), 'Member'), a.user_id;
end;
$$;

revoke all on function public.list_meeting_attendee_members(uuid) from public, anon;
grant execute on function public.list_meeting_attendee_members(uuid) to authenticated;
