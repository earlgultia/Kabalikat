-- Enforce the Community Programs entitlement at the database boundary for
-- barangay project reads and writes, including SECURITY DEFINER RPC writes.

create or replace function public.enforce_barangay_project_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tenant_plan_feature_enabled(new.barangay_id, 'community_programs') then
    raise exception 'barangay project workflows are unavailable under the current subscription plan';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_barangay_project_plan() from public, anon, authenticated;

drop trigger if exists barangay_projects_require_community_programs on public.barangay_projects;
create trigger barangay_projects_require_community_programs
  before insert or update on public.barangay_projects
  for each row execute function public.enforce_barangay_project_plan();

drop trigger if exists barangay_project_updates_require_community_programs on public.barangay_project_updates;
create trigger barangay_project_updates_require_community_programs
  before insert or update on public.barangay_project_updates
  for each row execute function public.enforce_barangay_project_plan();

drop trigger if exists barangay_project_events_require_community_programs on public.barangay_project_events;
create trigger barangay_project_events_require_community_programs
  before insert or update on public.barangay_project_events
  for each row execute function public.enforce_barangay_project_plan();

drop trigger if exists barangay_project_update_responses_require_community_programs
  on public.barangay_project_update_responses;
create trigger barangay_project_update_responses_require_community_programs
  before insert or update on public.barangay_project_update_responses
  for each row execute function public.enforce_barangay_project_plan();

drop policy if exists barangay_projects_read on public.barangay_projects;
create policy barangay_projects_read
  on public.barangay_projects for select to authenticated
  using (
    public.is_active_member(barangay_id)
    and public.tenant_plan_feature_enabled(barangay_id, 'community_programs')
  );

drop policy if exists barangay_project_updates_read on public.barangay_project_updates;
create policy barangay_project_updates_read
  on public.barangay_project_updates for select to authenticated
  using (
    public.is_active_member(barangay_id)
    and public.tenant_plan_feature_enabled(barangay_id, 'community_programs')
  );

drop policy if exists barangay_project_events_read on public.barangay_project_events;
create policy barangay_project_events_read
  on public.barangay_project_events for select to authenticated
  using (
    public.is_active_member(barangay_id)
    and public.tenant_plan_feature_enabled(barangay_id, 'community_programs')
    and public.has_tenant_permission(barangay_id, 'project.manage')
  );
