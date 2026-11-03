-- Resolve a reply alert to the author's own project update and its current pages.
create or replace function public.get_my_project_response_notification_target(p_update_id uuid)
returns table (
  project_id uuid,
  project_page integer,
  update_page integer,
  response_page integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
  v_project_id uuid;
  v_author_id uuid;
  v_project_created_at timestamptz;
  v_update_created_at timestamptz;
  v_project_position bigint;
  v_update_position bigint;
  v_response_count bigint;
begin
  select update_record.barangay_id, update_record.project_id, update_record.created_by,
    update_record.created_at, project.created_at
  into v_barangay_id, v_project_id, v_author_id, v_update_created_at, v_project_created_at
  from public.barangay_project_updates update_record
  join public.barangay_projects project
    on project.id = update_record.project_id
   and project.barangay_id = update_record.barangay_id
  where update_record.id = p_update_id;

  if v_barangay_id is null
    or v_author_id <> (select auth.uid())
    or not public.is_active_member(v_barangay_id) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_project_position
  from public.barangay_projects project
  where project.barangay_id = v_barangay_id
    and (project.created_at, project.id) > (v_project_created_at, v_project_id);

  select count(*) into v_update_position
  from public.barangay_project_updates update_record
  where update_record.barangay_id = v_barangay_id
    and update_record.project_id = v_project_id
    and (update_record.created_at, update_record.id) > (
      v_update_created_at,
      p_update_id
    );

  select count(*) into v_response_count
  from public.barangay_project_update_responses response
  where response.update_id = p_update_id
    and response.barangay_id = v_barangay_id;

  return query select v_project_id,
    (v_project_position / 20)::integer,
    (v_update_position / 25)::integer,
    greatest(((v_response_count - 1) / 10)::integer, 0);
end;
$$;

revoke all on function public.get_my_project_response_notification_target(uuid) from public, anon;
grant execute on function public.get_my_project_response_notification_target(uuid) to authenticated;
