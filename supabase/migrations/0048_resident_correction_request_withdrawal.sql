-- Allow request owners to withdraw a correction while staff review has not begun.
alter table public.resident_profile_change_requests
  drop constraint if exists resident_profile_change_requests_status_check;
alter table public.resident_profile_change_requests
  add constraint resident_profile_change_requests_status_check
  check (status in ('pending','approved','rejected','cancelled'));
alter table public.resident_profile_change_events
  drop constraint if exists resident_profile_change_events_action_check;
alter table public.resident_profile_change_events
  add constraint resident_profile_change_events_action_check
  check (action in ('submitted','approved','rejected','cancelled'));

create or replace function public.cancel_resident_profile_change(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.resident_profile_change_requests%rowtype;
begin
  select * into v_request from public.resident_profile_change_requests
    where id = p_request_id for update;
  if not found or v_request.requested_by <> auth.uid() then raise exception 'not authorized'; end if;
  if v_request.status <> 'pending' then raise exception 'only a pending request can be withdrawn'; end if;
  update public.resident_profile_change_requests set
    status = 'cancelled',reviewed_by = auth.uid(),reviewed_at = now(),review_reason = 'Withdrawn by requester'
  where id = v_request.id;
  insert into public.resident_profile_change_events(barangay_id,request_id,actor_id,action,reason)
    values (v_request.barangay_id,v_request.id,auth.uid(),'cancelled','Withdrawn by requester');
end;
$$;
revoke all on function public.cancel_resident_profile_change(uuid) from public,anon;
grant execute on function public.cancel_resident_profile_change(uuid) to authenticated;
