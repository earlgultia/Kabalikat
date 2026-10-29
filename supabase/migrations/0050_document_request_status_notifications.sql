-- Keep service decision alerts in the existing in-app inbox. The alert stores
-- only a request pointer; authorization is checked against the linked resident.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check
  check (resource_type in ('announcement','disaster_advisory','resident_profile_change','document_request'));

create or replace function public.can_access_community_notification(
  p_resource_type text,p_resource_id uuid,p_barangay_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select case p_resource_type
    when 'announcement' then exists (
      select 1 from public.announcements a where a.id = p_resource_id and a.barangay_id = p_barangay_id
        and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
    )
    when 'disaster_advisory' then exists (
      select 1 from public.disaster_advisories a where a.id = p_resource_id and a.barangay_id = p_barangay_id
        and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
    )
    when 'resident_profile_change' then exists (
      select 1 from public.resident_profile_change_requests r
      where r.id = p_resource_id and r.barangay_id = p_barangay_id
        and r.requested_by = (select auth.uid()) and r.status in ('approved','rejected')
    )
    when 'document_request' then exists (
      select 1 from public.document_requests d
      join public.residents r on r.id = d.resident_id and r.barangay_id = d.barangay_id
      where d.id = p_resource_id and d.barangay_id = p_barangay_id and r.user_id = (select auth.uid())
    )
    else false
  end;
$$;
revoke all on function public.can_access_community_notification(text,uuid,uuid) from public,anon;
grant execute on function public.can_access_community_notification(text,uuid,uuid) to authenticated;

drop policy community_notifications_read on public.community_notifications;
create policy community_notifications_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid()) and public.is_active_member(barangay_id)
    and public.can_access_community_notification(resource_type,resource_id,barangay_id)
  );
drop policy community_notifications_mark_read on public.community_notifications;
create policy community_notifications_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null and public.is_active_member(barangay_id)
    and public.can_access_community_notification(resource_type,resource_id,barangay_id)
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null and public.is_active_member(barangay_id)
    and public.can_access_community_notification(resource_type,resource_id,barangay_id)
  );

create or replace function public.notify_document_request_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_resident_user_id uuid;
begin
  if old.status is not distinct from new.status then return new; end if;
  select r.user_id into v_resident_user_id from public.residents r
    where r.id = new.resident_id and r.barangay_id = new.barangay_id;
  if v_resident_user_id is null or v_resident_user_id = (select auth.uid()) then return new; end if;
  insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
    values (new.barangay_id,v_resident_user_id,'document_request',new.id)
    on conflict (recipient_id,resource_type,resource_id) do update
      set created_at = now(),read_at = null;
  return new;
end;
$$;
create trigger document_requests_notify_resident_status
  after update of status on public.document_requests
  for each row execute function public.notify_document_request_status();
revoke all on function public.notify_document_request_status() from public,anon,authenticated;
