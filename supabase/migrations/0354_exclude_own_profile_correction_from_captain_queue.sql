-- A Captain cannot review their own profile correction, so omit it from both
-- the dashboard count and the review queue.
alter function public.get_captain_review_queue_summary(uuid)
  rename to get_captain_review_queue_summary_unchecked;
revoke all on function public.get_captain_review_queue_summary_unchecked(uuid)
  from public, anon, authenticated;

create function public.get_captain_review_queue_summary(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_summary jsonb;
  v_corrections bigint;
begin
  -- The previous function enforces Captain dashboard membership and access.
  v_summary := public.get_captain_review_queue_summary_unchecked(p_barangay_id);

  if public.has_tenant_permission(p_barangay_id, 'resident.update') then
    select count(*) into v_corrections
    from public.resident_profile_change_requests request
    where request.barangay_id = p_barangay_id
      and request.status = 'pending'
      and request.requested_by <> (select auth.uid());

    v_summary := v_summary || jsonb_build_object('pending_profile_corrections', v_corrections);
  end if;

  return v_summary;
end;
$$;

revoke all on function public.get_captain_review_queue_summary(uuid) from public, anon;
grant execute on function public.get_captain_review_queue_summary(uuid) to authenticated;
