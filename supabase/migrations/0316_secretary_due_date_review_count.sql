-- Secretaries are committee managers and can review task due-date requests.
-- Expose only the count for their own active barangay on the overview.
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
  where request.barangay_id = p_barangay_id
    and request.status = 'pending';

  return v_pending;
end;
$$;

revoke all on function public.get_secretary_due_date_review_count(uuid) from public, anon;
grant execute on function public.get_secretary_due_date_review_count(uuid) to authenticated;
