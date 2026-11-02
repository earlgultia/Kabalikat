-- Give Secretaries a permission-scoped summary of the desk work they can act on.
create index if not exists residents_secretary_review_queue_idx
  on public.residents(barangay_id, created_by, record_status);
create index if not exists resident_corrections_secretary_review_queue_idx
  on public.resident_profile_change_requests(barangay_id, requested_by)
  where status = 'pending';
create index if not exists document_requests_secretary_review_queue_idx
  on public.document_requests(barangay_id, status, resident_id)
  where status in ('pending', 'under_review', 'awaiting_approval');
create index if not exists meeting_minutes_secretary_review_queue_idx
  on public.meeting_minutes(barangay_id, drafted_by, meeting_id)
  where status = 'draft';

create or replace function public.get_secretary_review_queue_summary(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_residency bigint;
  v_corrections bigint;
  v_documents bigint;
  v_resolutions bigint;
  v_minutes bigint;
begin
  if not public.is_active_member(p_barangay_id)
    or not (
      public.has_tenant_permission(p_barangay_id, 'resident.verify')
      or public.has_tenant_permission(p_barangay_id, 'resident.update')
      or public.has_tenant_permission(p_barangay_id, 'document.request.read')
      or public.has_tenant_permission(p_barangay_id, 'meeting.manage')
    ) then
    raise exception 'not authorized';
  end if;

  if public.has_tenant_permission(p_barangay_id, 'resident.verify') then
    select count(*) into v_residency
    from public.residents resident
    where resident.barangay_id = p_barangay_id
      and resident.record_status = 'active'
      and resident.created_by <> (select auth.uid())
      and coalesce((
        select verification.status
        from public.residency_verifications verification
        where verification.resident_id = resident.id
          and verification.barangay_id = resident.barangay_id
        order by verification.created_at desc, verification.id desc
        limit 1
      ), 'pending') = 'pending';
  end if;

  if public.has_tenant_permission(p_barangay_id, 'resident.update') then
    select count(*) into v_corrections
    from public.resident_profile_change_requests correction
    where correction.barangay_id = p_barangay_id
      and correction.status = 'pending'
      and correction.requested_by <> (select auth.uid());
  end if;

  if public.has_tenant_permission(p_barangay_id, 'document.request.read') then
    select count(*) into v_documents
    from public.document_requests request
    where request.barangay_id = p_barangay_id
      and request.status in ('pending', 'under_review', 'awaiting_approval')
      and not exists (
        select 1 from public.residents resident
        where resident.id = request.resident_id
          and resident.barangay_id = request.barangay_id
          and resident.user_id = (select auth.uid())
      );
  end if;

  if public.has_tenant_permission(p_barangay_id, 'meeting.manage') then
    select count(*) into v_resolutions
    from public.meeting_resolutions resolution
    where resolution.barangay_id = p_barangay_id
      and resolution.status = 'draft'
      and resolution.proposed_by <> (select auth.uid());

    select count(*) into v_minutes
    from public.meeting_minutes minutes
    where minutes.barangay_id = p_barangay_id
      and minutes.status = 'draft'
      and minutes.drafted_by <> (select auth.uid());
  end if;

  return jsonb_build_object(
    'pending_residency_verifications', v_residency,
    'pending_profile_corrections', v_corrections,
    'pending_documents', v_documents,
    'pending_meeting_resolutions', v_resolutions,
    'meeting_minutes_to_review', v_minutes,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_secretary_review_queue_summary(uuid) from public, anon;
grant execute on function public.get_secretary_review_queue_summary(uuid) to authenticated;
