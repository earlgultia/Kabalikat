-- Authenticated resident feedback with private owner access, staff responses,
-- and an append-only event trail. This is not an emergency reporting channel.
insert into public.permissions(key,description) values
  ('community.feedback.manage','Read and respond to resident community feedback')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where r.key in ('captain','secretary') and p.key='community.feedback.manage'
on conflict do nothing;

create table public.community_feedback (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  category text not null check(category in ('service','suggestion','accessibility','other')),
  subject text not null,
  message text not null,
  status text not null default 'submitted' check(status in ('submitted','in_review','responded','closed')),
  staff_response text,
  responded_by uuid references public.profiles(id) on delete restrict,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,barangay_id),
  check(length(trim(subject)) between 3 and 160),
  check(length(trim(message)) between 10 and 3000),
  check(staff_response is null or length(trim(staff_response)) between 3 and 2000),
  check((staff_response is null)=(responded_by is null)),
  check((staff_response is null)=(responded_at is null)),
  check(status <> 'responded' or staff_response is not null)
);
create index community_feedback_owner_idx on public.community_feedback(submitted_by,barangay_id,created_at desc);
create index community_feedback_staff_queue_idx on public.community_feedback(barangay_id,status,created_at desc);

create table public.community_feedback_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  feedback_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check(action in ('submitted','review_started','responded','closed')),
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key(feedback_id,barangay_id) references public.community_feedback(id,barangay_id) on delete restrict,
  check(length(note) <= 2000)
);
create index community_feedback_events_idx on public.community_feedback_events(feedback_id,created_at);

alter table public.community_feedback enable row level security;
alter table public.community_feedback_events enable row level security;
create policy community_feedback_read on public.community_feedback for select to authenticated
  using (submitted_by=(select auth.uid()) or public.has_tenant_permission(barangay_id,'community.feedback.manage'));
create policy community_feedback_events_read on public.community_feedback_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'community.feedback.manage') or exists (
    select 1 from public.community_feedback f where f.id=feedback_id and f.submitted_by=(select auth.uid())
  ));
revoke all on public.community_feedback,public.community_feedback_events from anon,authenticated;
grant select(id,barangay_id,category,subject,message,status,staff_response,responded_at,created_at,updated_at)
  on public.community_feedback to authenticated;
grant select(id,barangay_id,feedback_id,action,note,created_at)
  on public.community_feedback_events to authenticated;

create or replace function public.submit_community_feedback(
  p_barangay_id uuid,p_category text,p_subject text,p_message text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_member(p_barangay_id) or not exists (
    select 1 from public.residents r where r.barangay_id=p_barangay_id and r.user_id=auth.uid() and r.record_status='active'
  ) then raise exception 'an active linked resident profile is required'; end if;
  if p_category is null or p_category not in ('service','suggestion','accessibility','other')
    or length(trim(coalesce(p_subject,''))) not between 3 and 160
    or length(trim(coalesce(p_message,''))) not between 10 and 3000 then
    raise exception 'feedback details are invalid';
  end if;
  insert into public.community_feedback(barangay_id,submitted_by,category,subject,message)
    values(p_barangay_id,auth.uid(),p_category,trim(p_subject),trim(p_message)) returning id into v_id;
  insert into public.community_feedback_events(barangay_id,feedback_id,actor_id,action)
    values(p_barangay_id,v_id,auth.uid(),'submitted');
  return v_id;
end;
$$;

create or replace function public.update_community_feedback(
  p_feedback_id uuid,p_next_status text,p_response text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_feedback public.community_feedback%rowtype; v_response text := nullif(trim(coalesce(p_response,'')),'');
        v_action text;
begin
  select * into v_feedback from public.community_feedback where id=p_feedback_id for update;
  if not found or not public.has_tenant_permission(v_feedback.barangay_id,'community.feedback.manage') then raise exception 'not authorized'; end if;
  if p_next_status is null or p_next_status not in ('in_review','responded','closed') then raise exception 'invalid feedback status'; end if;
  if v_feedback.status='submitted' and p_next_status not in ('in_review','closed')
    or v_feedback.status='in_review' and p_next_status not in ('responded','closed')
    or v_feedback.status='responded' and p_next_status <> 'closed'
    or v_feedback.status='closed' then raise exception 'invalid feedback status transition'; end if;
  if p_next_status='responded' and (v_response is null or length(v_response) not between 3 and 2000) then
    raise exception 'a response between 3 and 2000 characters is required';
  end if;
  if p_next_status='in_review' and v_response is not null then raise exception 'a response can only be added when responding or closing'; end if;
  if v_response is not null and length(v_response) not between 3 and 2000 then raise exception 'response is too long or too short'; end if;
  v_action := case when p_next_status='in_review' then 'review_started'
    when p_next_status='responded' then 'responded' else 'closed' end;
  update public.community_feedback set status=p_next_status,
    staff_response=coalesce(v_response,staff_response),
    responded_by=case when v_response is not null then auth.uid() else responded_by end,
    responded_at=case when v_response is not null then now() else responded_at end,
    updated_at=now() where id=v_feedback.id;
  insert into public.community_feedback_events(barangay_id,feedback_id,actor_id,action,note)
    values(v_feedback.barangay_id,v_feedback.id,auth.uid(),v_action,coalesce(v_response,''));
end;
$$;

-- Extend the shared inbox to allow only the feedback owner to open response notices.
alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check
  check(resource_type in ('announcement','disaster_advisory','resident_profile_change','document_request','community_feedback'));

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
      and f.submitted_by=(select auth.uid()) and f.status in ('responded','closed') and f.staff_response is not null)
    else false
  end;
$$;
revoke all on function public.can_access_community_notification(text,uuid,uuid) from public,anon;
grant execute on function public.can_access_community_notification(text,uuid,uuid) to authenticated;

create or replace function public.notify_community_feedback_response()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('responded','closed') or new.staff_response is null
    or old.status is not distinct from new.status and old.staff_response is not distinct from new.staff_response then return new; end if;
  if new.submitted_by=(select auth.uid()) then return new; end if;
  insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
    values(new.barangay_id,new.submitted_by,'community_feedback',new.id)
    on conflict(recipient_id,resource_type,resource_id) do update set created_at=now(),read_at=null;
  return new;
end;
$$;
create trigger community_feedback_notify_response after update of status,staff_response on public.community_feedback
  for each row execute function public.notify_community_feedback_response();

revoke all on function public.submit_community_feedback(uuid,text,text,text) from public,anon;
revoke all on function public.update_community_feedback(uuid,text,text) from public,anon;
revoke all on function public.notify_community_feedback_response() from public,anon,authenticated;
grant execute on function public.submit_community_feedback(uuid,text,text,text) to authenticated;
grant execute on function public.update_community_feedback(uuid,text,text) to authenticated;
