-- Reject Kagawad blocker and completion actions before their workflow runs
-- when the barangay does not have community-programs enabled.

alter function public.report_kagawad_task_blocker(uuid, text)
  rename to report_kagawad_task_blocker_unchecked;
revoke all on function public.report_kagawad_task_blocker_unchecked(uuid, text)
  from public, anon, authenticated;

create function public.report_kagawad_task_blocker(p_task_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  select task.barangay_id into v_barangay_id
  from public.committee_tasks task
  where task.id = p_task_id;

  if v_barangay_id is null
    or not public.tenant_plan_feature_enabled(v_barangay_id, 'community_programs') then
    raise exception 'not authorized';
  end if;

  perform public.report_kagawad_task_blocker_unchecked(p_task_id, p_reason);
end;
$$;

revoke all on function public.report_kagawad_task_blocker(uuid, text) from public, anon;
grant execute on function public.report_kagawad_task_blocker(uuid, text) to authenticated;

alter function public.complete_kagawad_task(uuid, text)
  rename to complete_kagawad_task_unchecked;
revoke all on function public.complete_kagawad_task_unchecked(uuid, text)
  from public, anon, authenticated;

create function public.complete_kagawad_task(p_task_id uuid, p_summary text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
begin
  select task.barangay_id into v_barangay_id
  from public.committee_tasks task
  where task.id = p_task_id;

  if v_barangay_id is null
    or not public.tenant_plan_feature_enabled(v_barangay_id, 'community_programs') then
    raise exception 'not authorized';
  end if;

  perform public.complete_kagawad_task_unchecked(p_task_id, p_summary);
end;
$$;

revoke all on function public.complete_kagawad_task(uuid, text) from public, anon;
grant execute on function public.complete_kagawad_task(uuid, text) to authenticated;

