-- Notify a resident in-app when staff decide their profile correction request.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check
  check (resource_type in ('announcement','disaster_advisory','resident_profile_change'));

-- The request's reviewer/requester IDs are deliberately not selectable columns.
-- Use a narrow definer helper so RLS can verify ownership without granting those IDs.
create or replace function public.can_read_resident_profile_change(p_request_id uuid,p_barangay_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.resident_profile_change_requests r
    where r.id = p_request_id and r.barangay_id = p_barangay_id
      and (r.requested_by = (select auth.uid())
        or public.has_tenant_permission(r.barangay_id,'resident.update'))
  );
$$;
revoke all on function public.can_read_resident_profile_change(uuid,uuid) from public,anon;
grant execute on function public.can_read_resident_profile_change(uuid,uuid) to authenticated;

drop policy resident_profile_change_requests_read on public.resident_profile_change_requests;
create policy resident_profile_change_requests_read on public.resident_profile_change_requests
  for select to authenticated using (public.can_read_resident_profile_change(id,barangay_id));
drop policy resident_profile_change_events_read on public.resident_profile_change_events;
create policy resident_profile_change_events_read on public.resident_profile_change_events
  for select to authenticated using (public.can_read_resident_profile_change(request_id,barangay_id));

drop policy community_notifications_read on public.community_notifications;
create policy community_notifications_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid()) and public.is_active_member(barangay_id)
    and (
      (resource_type = 'announcement' and exists (
        select 1 from public.announcements a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
      or (resource_type = 'disaster_advisory' and exists (
        select 1 from public.disaster_advisories a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
      or (resource_type = 'resident_profile_change' and exists (
        select 1 from public.resident_profile_change_requests r
        where public.can_read_resident_profile_change(r.id,community_notifications.barangay_id)
          and r.id = resource_id and r.barangay_id = community_notifications.barangay_id
          and r.status in ('approved','rejected')
      ))
    )
  );

drop policy community_notifications_mark_read on public.community_notifications;
create policy community_notifications_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null and public.is_active_member(barangay_id)
    and (
      (resource_type = 'announcement' and exists (
        select 1 from public.announcements a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
      or (resource_type = 'disaster_advisory' and exists (
        select 1 from public.disaster_advisories a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
      or (resource_type = 'resident_profile_change' and exists (
        select 1 from public.resident_profile_change_requests r
        where public.can_read_resident_profile_change(r.id,community_notifications.barangay_id)
          and r.id = resource_id and r.barangay_id = community_notifications.barangay_id
          and r.status in ('approved','rejected')
      ))
    )
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null and public.is_active_member(barangay_id)
    and (
      (resource_type = 'announcement' and exists (
        select 1 from public.announcements a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
      or (resource_type = 'disaster_advisory' and exists (
        select 1 from public.disaster_advisories a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
      or (resource_type = 'resident_profile_change' and exists (
        select 1 from public.resident_profile_change_requests r
        where public.can_read_resident_profile_change(r.id,community_notifications.barangay_id)
          and r.id = resource_id and r.barangay_id = community_notifications.barangay_id
          and r.status in ('approved','rejected')
      ))
    )
  );

create or replace function public.review_resident_profile_change(
  p_request_id uuid,p_decision text,p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.resident_profile_change_requests%rowtype;
begin
  select * into v_request from public.resident_profile_change_requests
    where id = p_request_id for update;
  if not found or not public.has_tenant_permission(v_request.barangay_id,'resident.update') then
    raise exception 'not authorized';
  end if;
  if v_request.status <> 'pending' then raise exception 'request has already been reviewed'; end if;
  if v_request.requested_by = auth.uid() then raise exception 'requester cannot review their own correction'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'invalid decision'; end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'a reason is required when rejecting a correction';
  end if;
  if p_decision = 'approved' then
    update public.residents set
      first_name = coalesce(v_request.proposed_first_name,first_name),
      last_name = coalesce(v_request.proposed_last_name,last_name),
      phone = coalesce(v_request.proposed_phone,phone),
      updated_at = now()
    where id = v_request.resident_id and barangay_id = v_request.barangay_id;
  end if;
  update public.resident_profile_change_requests set
    status = p_decision,reviewed_by = auth.uid(),reviewed_at = now(),
    review_reason = nullif(trim(p_reason),'')
  where id = v_request.id;
  insert into public.resident_profile_change_events(barangay_id,request_id,actor_id,action,reason)
    values (v_request.barangay_id,v_request.id,auth.uid(),p_decision,nullif(trim(p_reason),''));
  insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
    values (v_request.barangay_id,v_request.requested_by,'resident_profile_change',v_request.id)
    on conflict (recipient_id,resource_type,resource_id) do nothing;
end;
$$;
