-- A resident should also be notified when staff close feedback without a
-- written response, so a status change is not silently missed.
create or replace function public.can_access_community_notification(
  p_resource_type text,p_resource_id uuid,p_barangay_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_member(p_barangay_id) and case p_resource_type
    when 'announcement' then exists (
      select 1 from public.announcements a where a.id=p_resource_id and a.barangay_id=p_barangay_id
        and a.status='published' and (a.expires_at is null or a.expires_at>now())
        and case a.audience
          when 'public' then true
          when 'officials' then public.has_tenant_permission(p_barangay_id,'announcement.officials.read')
          when 'residents' then exists (select 1 from public.barangay_memberships m join public.role_definitions r on r.id=m.role_id and r.key='resident'
            where m.user_id=(select auth.uid()) and m.barangay_id=p_barangay_id and m.status='active')
          when 'role' then exists (select 1 from public.barangay_memberships m where m.user_id=(select auth.uid())
            and m.barangay_id=p_barangay_id and m.status='active' and m.role_id=a.audience_role_id)
          else false end
    )
    when 'disaster_advisory' then exists (select 1 from public.disaster_advisories a where a.id=p_resource_id
      and a.barangay_id=p_barangay_id and a.status='published' and (a.expires_at is null or a.expires_at>now())
      and public.has_tenant_permission(p_barangay_id,'disaster.read'))
    when 'resident_profile_change' then exists (select 1 from public.resident_profile_change_requests r where r.id=p_resource_id
      and r.barangay_id=p_barangay_id and r.requested_by=(select auth.uid()) and r.status in ('approved','rejected'))
    when 'document_request' then exists (select 1 from public.document_requests d join public.residents r
      on r.id=d.resident_id and r.barangay_id=d.barangay_id where d.id=p_resource_id and d.barangay_id=p_barangay_id and r.user_id=(select auth.uid()))
    when 'community_feedback' then exists (select 1 from public.community_feedback f where f.id=p_resource_id and f.barangay_id=p_barangay_id
      and f.submitted_by=(select auth.uid()) and (f.status='closed' or (f.status='responded' and f.staff_response is not null)))
    else false
  end;
$$;
revoke all on function public.can_access_community_notification(text,uuid,uuid) from public,anon;
grant execute on function public.can_access_community_notification(text,uuid,uuid) to authenticated;

create or replace function public.notify_community_feedback_response()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('responded','closed')
    or (new.status='responded' and new.staff_response is null)
    or (old.status is not distinct from new.status and old.staff_response is not distinct from new.staff_response) then return new; end if;
  if new.submitted_by=(select auth.uid()) then return new; end if;
  insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
    values(new.barangay_id,new.submitted_by,'community_feedback',new.id)
    on conflict(recipient_id,resource_type,resource_id) do update set created_at=now(),read_at=null;
  return new;
end;
$$;
revoke all on function public.notify_community_feedback_response() from public,anon,authenticated;
