-- Give project managers a private reply thread for project updates.
create unique index if not exists barangay_project_updates_id_barangay_key
  on public.barangay_project_updates(id, barangay_id);

create table public.barangay_project_update_responses (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null,
  barangay_id uuid not null,
  author_id uuid not null references public.profiles(id) on delete restrict,
  content text not null,
  created_at timestamptz not null default now(),
  foreign key (update_id, barangay_id)
    references public.barangay_project_updates(id, barangay_id) on delete restrict,
  check (length(trim(content)) between 3 and 3000)
);

create index barangay_project_update_responses_history_idx
  on public.barangay_project_update_responses(update_id, created_at, id);

alter table public.barangay_project_update_responses enable row level security;
revoke all on public.barangay_project_update_responses from public, anon, authenticated;

create or replace function public.can_access_barangay_project_update_responses(
  p_update_id uuid,
  p_barangay_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member(p_barangay_id)
    and exists (
      select 1
      from public.barangay_project_updates update_record
      where update_record.id = p_update_id
        and update_record.barangay_id = p_barangay_id
        and (
          public.has_tenant_permission(p_barangay_id, 'project.manage')
          or update_record.created_by = (select auth.uid())
        )
    );
$$;

revoke all on function public.can_access_barangay_project_update_responses(uuid, uuid) from public, anon;
grant execute on function public.can_access_barangay_project_update_responses(uuid, uuid) to authenticated;

create policy barangay_project_update_responses_read
  on public.barangay_project_update_responses for select to authenticated
  using (public.can_access_barangay_project_update_responses(update_id, barangay_id));

create or replace function public.list_barangay_project_update_responses(p_update_id uuid)
returns table (
  id uuid,
  author_name text,
  content text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  select update_record.barangay_id into v_barangay_id
  from public.barangay_project_updates update_record
  where update_record.id = p_update_id;

  if v_barangay_id is null
    or not public.can_access_barangay_project_update_responses(p_update_id, v_barangay_id) then
    raise exception 'not authorized';
  end if;

  return query
  select response.id,
    coalesce(nullif(profile.display_name, ''), 'Workspace member'),
    response.content,
    response.created_at
  from public.barangay_project_update_responses response
  join public.profiles profile on profile.id = response.author_id
  where response.update_id = p_update_id
    and response.barangay_id = v_barangay_id
  order by response.created_at, response.id;
end;
$$;

revoke all on function public.list_barangay_project_update_responses(uuid) from public, anon;
grant execute on function public.list_barangay_project_update_responses(uuid) to authenticated;

create or replace function public.add_barangay_project_update_response(
  p_update_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
  v_update_author uuid;
  v_response_id uuid;
begin
  select update_record.barangay_id, update_record.created_by
    into v_barangay_id, v_update_author
  from public.barangay_project_updates update_record
  where update_record.id = p_update_id;

  if v_barangay_id is null
    or not public.is_active_member(v_barangay_id)
    or not public.has_tenant_permission(v_barangay_id, 'project.manage')
    or v_update_author = (select auth.uid()) then
    raise exception 'not authorized';
  end if;
  if length(trim(coalesce(p_content, ''))) not between 3 and 3000 then
    raise exception 'project update response must contain 3 to 3000 characters';
  end if;

  insert into public.barangay_project_update_responses(
    update_id, barangay_id, author_id, content
  ) values (
    p_update_id, v_barangay_id, (select auth.uid()), trim(p_content)
  ) returning id into v_response_id;

  if exists (
    select 1 from public.barangay_memberships membership
    where membership.barangay_id = v_barangay_id
      and membership.user_id = v_update_author
      and membership.status = 'active'
  ) then
    insert into public.community_notifications(barangay_id, recipient_id, resource_type, resource_id)
    values (v_barangay_id, v_update_author, 'barangay_project_update_response', p_update_id)
    on conflict (recipient_id, resource_type, resource_id)
    do update set created_at = now(), read_at = null;
  end if;

  return v_response_id;
end;
$$;

revoke all on function public.add_barangay_project_update_response(uuid, text) from public, anon;
grant execute on function public.add_barangay_project_update_response(uuid, text) to authenticated;

alter table public.community_notifications
  drop constraint if exists community_notifications_resource_type_check;
alter table public.community_notifications
  add constraint community_notifications_resource_type_check check (resource_type in (
    'announcement', 'disaster_advisory', 'resident_profile_change', 'document_request',
    'community_feedback', 'meeting_update', 'meeting_resolution', 'health_outreach_cancellation',
    'health_outreach_completion', 'health_outreach_review', 'health_outreach_published',
    'health_outreach_review_submission', 'health_outreach_rescheduled', 'sk_event_review_submission',
    'sk_event_published', 'sk_event_review_feedback', 'sk_event_cancelled', 'sk_event_rescheduled',
    'sk_event_completed', 'incident_assignment', 'incident_status_change', 'patrol_shift_assignment',
    'patrol_shift_cancelled', 'patrol_shift_rescheduled', 'patrol_shift_started', 'patrol_shift_completed',
    'support_ticket_update', 'committee_task_update', 'committee_task_progress', 'committee_due_date_request',
    'attendance_correction_request', 'committee_task_assignment', 'barangay_project_update',
    'barangay_project_update_response'
  ));

create or replace function public.can_access_barangay_project_update_response_notification(
  p_update_id uuid,
  p_barangay_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member(p_barangay_id)
    and exists (
      select 1
      from public.barangay_project_updates update_record
      where update_record.id = p_update_id
        and update_record.barangay_id = p_barangay_id
        and (
          public.has_tenant_permission(p_barangay_id, 'project.manage')
          or update_record.created_by = (select auth.uid())
        )
    );
$$;

revoke all on function public.can_access_barangay_project_update_response_notification(uuid, uuid) from public, anon;
grant execute on function public.can_access_barangay_project_update_response_notification(uuid, uuid) to authenticated;

create policy community_notifications_barangay_project_update_response_read
  on public.community_notifications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and resource_type = 'barangay_project_update_response'
    and public.can_access_barangay_project_update_response_notification(resource_id, barangay_id)
  );

create policy community_notifications_barangay_project_update_response_mark_read
  on public.community_notifications for update to authenticated
  using (
    recipient_id = (select auth.uid())
    and read_at is null
    and resource_type = 'barangay_project_update_response'
    and public.can_access_barangay_project_update_response_notification(resource_id, barangay_id)
  )
  with check (
    recipient_id = (select auth.uid())
    and read_at is not null
    and resource_type = 'barangay_project_update_response'
    and public.can_access_barangay_project_update_response_notification(resource_id, barangay_id)
  );

-- Add an ownership flag without exposing the author's profile id.
drop function public.list_barangay_project_update_page(uuid, integer, integer);
create function public.list_barangay_project_update_page(
  p_project_id uuid,
  p_page integer default 0,
  p_page_size integer default 25
)
returns table (
  id uuid,
  project_id uuid,
  update_type text,
  title text,
  details text,
  created_at timestamptz,
  is_own_update boolean,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  return query
  with counted as (
    select update_record.id, update_record.project_id, update_record.update_type,
      update_record.title, update_record.details, update_record.created_at,
      (update_record.created_by = (select auth.uid())) as is_own_update,
      count(*) over () as total_count
    from public.barangay_project_updates update_record
    join public.barangay_projects project
      on project.id = update_record.project_id
     and project.barangay_id = update_record.barangay_id
    where update_record.project_id = p_project_id
  )
  select counted.id, counted.project_id, counted.update_type, counted.title,
    counted.details, counted.created_at, counted.is_own_update, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;

revoke all on function public.list_barangay_project_update_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_barangay_project_update_page(uuid, integer, integer) to authenticated;
