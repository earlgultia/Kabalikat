-- Match the Secretary overview count to the actionable due-date review queue,
-- which excludes requests belonging to archived committees.
create or replace function public.get_secretary_due_date_review_count(p_barangay_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pending bigint;
begin
  if not public.is_active_member(p_barangay_id)
    or not public.has_tenant_permission(p_barangay_id, 'committee.manage') then
    raise exception 'not authorized';
  end if;

  select count(*) into v_pending
  from public.committee_task_due_date_requests request
  join public.committees committee
    on committee.id = request.committee_id
    and committee.barangay_id = request.barangay_id
  where request.barangay_id = p_barangay_id
    and request.status = 'pending'
    and committee.status = 'active';

  return v_pending;
end;
$$;

revoke all on function public.get_secretary_due_date_review_count(uuid) from public, anon;
grant execute on function public.get_secretary_due_date_review_count(uuid) to authenticated;
