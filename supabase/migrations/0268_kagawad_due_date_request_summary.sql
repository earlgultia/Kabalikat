-- Add private due-date request totals to the Kagawad overview.
create or replace function public.get_kagawad_due_date_request_summary(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pending bigint;
  v_reviewed_last_30_days bigint;
begin
  if not public.is_active_member(p_barangay_id)
    or not exists (
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    ) then
    raise exception 'not authorized';
  end if;

  select
    count(*) filter (where request.status = 'pending'),
    count(*) filter (
      where request.status in ('approved', 'declined')
        and request.reviewed_at >= now() - interval '30 days'
    )
  into v_pending, v_reviewed_last_30_days
  from public.committee_task_due_date_requests request
  where request.barangay_id = p_barangay_id
    and request.requester_id = (select auth.uid());

  return jsonb_build_object(
    'pending_requests', v_pending,
    'reviewed_last_30_days', v_reviewed_last_30_days,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_kagawad_due_date_request_summary(uuid) from public, anon;
grant execute on function public.get_kagawad_due_date_request_summary(uuid) to authenticated;
