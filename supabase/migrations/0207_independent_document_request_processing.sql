-- Prevent requesters who also hold staff roles from processing their own applications.
create or replace function public.transition_document_request(
  p_request_id uuid, p_next_status text, p_reason text default null
)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_req public.document_requests%rowtype; v_allowed boolean := false; v_number text;
begin
  select * into v_req from public.document_requests where id = p_request_id for update;
  if not found then raise exception 'request not found'; end if;
  if p_next_status = 'cancelled' and v_req.status = 'pending' and exists (
    select 1 from public.residents r where r.id = v_req.resident_id and r.user_id = (select auth.uid())
  ) then
    v_allowed := true;
  elsif exists (
    select 1 from public.residents r where r.id = v_req.resident_id and r.user_id = (select auth.uid())
  ) then
    raise exception 'requester cannot process their own document request';
  else
    if p_next_status in ('issued','released') then
      if not public.has_tenant_permission(v_req.barangay_id, 'document.issue') then raise exception 'not authorized'; end if;
    elsif not public.has_tenant_permission(v_req.barangay_id, 'document.request.review') then
      raise exception 'not authorized';
    end if;
    v_allowed := (v_req.status = 'pending' and p_next_status in ('under_review','rejected'))
      or (v_req.status = 'under_review' and p_next_status in ('awaiting_approval','approved','rejected'))
      or (v_req.status = 'awaiting_approval' and p_next_status in ('approved','rejected'))
      or (v_req.status = 'approved' and p_next_status = 'issued')
      or (v_req.status = 'issued' and p_next_status = 'released');
  end if;
  if not v_allowed then raise exception 'invalid request transition'; end if;
  if p_next_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a rejection reason is required';
  end if;
  update public.document_requests set status = p_next_status,
    reviewed_by = case when p_next_status in ('under_review','awaiting_approval','approved','rejected') then (select auth.uid()) else reviewed_by end,
    reviewed_at = case when p_next_status in ('under_review','awaiting_approval','approved','rejected') then now() else reviewed_at end,
    rejection_reason = case when p_next_status = 'rejected' then trim(p_reason) else null end
  where id = p_request_id;
  if p_next_status = 'issued' then
    v_number := to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.issued_documents(barangay_id, request_id, issuance_number, issued_by)
    values (v_req.barangay_id, v_req.id, v_number, (select auth.uid()));
  end if;
  insert into public.document_request_events(barangay_id, request_id, actor_id, from_status, to_status, reason)
  values (v_req.barangay_id, v_req.id, (select auth.uid()), v_req.status, p_next_status, nullif(trim(p_reason), ''));
end;
$$;

revoke all on function public.transition_document_request(uuid, text, text) from public, anon;
grant execute on function public.transition_document_request(uuid, text, text) to authenticated;

create or replace function public.revoke_issued_document(p_request_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_document public.issued_documents%rowtype;
begin
  select * into v_document from public.issued_documents where request_id = p_request_id for update;
  if not found or not public.has_tenant_permission(v_document.barangay_id,'document.issue') then
    raise exception 'not authorized';
  end if;
  if exists (
    select 1 from public.document_requests request
    join public.residents resident on resident.id = request.resident_id and resident.barangay_id = request.barangay_id
    where request.id = p_request_id and resident.user_id = (select auth.uid())
  ) then
    raise exception 'requester cannot revoke their own issued document';
  end if;
  if v_document.verification_status <> 'valid' then raise exception 'issued document is no longer valid'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'a revocation reason is required'; end if;
  update public.issued_documents set verification_status = 'revoked' where id = v_document.id;
  insert into public.issued_document_events(barangay_id,issued_document_id,actor_id,action,reason)
    values (v_document.barangay_id,v_document.id,(select auth.uid()),'revoked',trim(p_reason));
end;
$$;

revoke all on function public.revoke_issued_document(uuid, text) from public, anon;
grant execute on function public.revoke_issued_document(uuid, text) to authenticated;

-- Prevent a staff member from deciding residency for a record they created.
create index if not exists residents_captain_residency_review_idx
  on public.residents(barangay_id, created_by, record_status);

create or replace function public.verify_residency(p_resident_id uuid, p_status text, p_reason text default null)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_resident public.residents%rowtype;
  v_verification_id uuid;
begin
  select * into v_resident
  from public.residents resident
  where resident.id = p_resident_id
  for update;

  if not found or not public.has_tenant_permission(v_resident.barangay_id, 'resident.verify') then
    raise exception 'not authorized';
  end if;
  if v_resident.created_by = (select auth.uid()) then
    raise exception 'another authorized staff member must verify a resident record you created';
  end if;
  if p_status not in ('verified','rejected') then
    raise exception 'invalid verification status';
  end if;
  if p_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reason is required';
  end if;

  insert into public.residency_verifications(barangay_id, resident_id, status, verified_by, verified_at, reason)
  values (v_resident.barangay_id, p_resident_id, p_status, (select auth.uid()), now(), nullif(trim(p_reason), ''))
  returning id into v_verification_id;
  return v_verification_id;
end;
$$;

revoke all on function public.verify_residency(uuid, text, text) from public, anon;
grant execute on function public.verify_residency(uuid, text, text) to authenticated;
-- Keep Captain residency review actions independent from record creation and align the dashboard count.
create index if not exists finance_budgets_captain_review_idx
  on public.finance_budgets(barangay_id, created_at desc) where status = 'draft';
create index if not exists financial_transactions_captain_review_idx
  on public.financial_transactions(barangay_id, created_at desc) where status = 'submitted';
create index if not exists finance_budget_amendments_captain_review_idx
  on public.finance_budget_amendments(barangay_id) where status = 'pending';
create index if not exists financial_adjustments_captain_review_idx
  on public.financial_adjustments(barangay_id) where status = 'pending';
create index if not exists meeting_resolutions_captain_review_idx
  on public.meeting_resolutions(barangay_id, created_at desc) where status = 'draft';

create or replace function public.get_captain_review_queue_summary(p_barangay_id uuid)
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
  v_finance bigint;
  v_health bigint;
  v_sk_events bigint;
  v_sk_projects bigint;
  v_sk_accomplishments bigint;
  v_incidents bigint;
  v_referrals bigint;
  v_invitations bigint;
  v_meeting_resolutions bigint;
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;

  if public.has_tenant_permission(p_barangay_id, 'resident.verify') then
    select count(*) into v_residency
    from public.residents resident
    where resident.barangay_id = p_barangay_id and resident.record_status = 'active'
      and resident.created_by <> (select auth.uid())
      and coalesce((
        select verification.status from public.residency_verifications verification
        where verification.resident_id = resident.id and verification.barangay_id = resident.barangay_id
        order by verification.created_at desc, verification.id desc limit 1
      ), 'pending') = 'pending';
  end if;

  if public.has_tenant_permission(p_barangay_id, 'resident.update') then
    select count(*) into v_corrections from public.resident_profile_change_requests change_req
    where change_req.barangay_id = p_barangay_id and change_req.status = 'pending';
  end if;

  if public.has_tenant_permission(p_barangay_id, 'document.request.read') then
    select count(*) into v_documents from public.document_requests doc_req
    where doc_req.barangay_id = p_barangay_id and doc_req.status in ('pending', 'under_review', 'awaiting_approval')
      and not exists (select 1 from public.residents request_owner
        where request_owner.id = doc_req.resident_id and request_owner.user_id = (select auth.uid()));
  end if;

  if public.has_tenant_permission(p_barangay_id, 'finance.approve') then
    select
      (select count(*) from public.finance_budgets budget
        where budget.barangay_id = p_barangay_id and budget.status = 'draft'
          and budget.created_by <> (select auth.uid()))
      + (select count(*) from public.financial_transactions transaction_record
        where transaction_record.barangay_id = p_barangay_id and transaction_record.status = 'submitted'
          and transaction_record.submitted_by <> (select auth.uid()))
      + (select count(*) from public.finance_budget_amendments amendment
        where amendment.barangay_id = p_barangay_id and amendment.status = 'pending'
          and amendment.requested_by <> (select auth.uid()))
      + (select count(*) from public.financial_adjustments adjustment
        where adjustment.barangay_id = p_barangay_id and adjustment.status = 'pending'
          and adjustment.requested_by <> (select auth.uid()))
    into v_finance;
  end if;

  if public.has_tenant_permission(p_barangay_id, 'health.campaign.review') then
    select count(*) into v_health from public.health_outreach_campaigns campaign
    where campaign.barangay_id = p_barangay_id and campaign.status in ('draft', 'changes_requested')
      and campaign.created_by <> (select auth.uid());
  end if;

  if public.has_tenant_permission(p_barangay_id, 'sk.event.review') then
    select count(*) into v_sk_events from public.sk_events sk_item
    where sk_item.barangay_id = p_barangay_id and sk_item.status in ('draft', 'changes_requested')
      and sk_item.created_by <> (select auth.uid());
  end if;

  if public.has_tenant_permission(p_barangay_id, 'sk.review') then
    select count(*) into v_sk_projects from public.sk_projects project
    where project.barangay_id = p_barangay_id and project.status = 'submitted'
      and project.created_by <> (select auth.uid());

    select count(*) into v_sk_accomplishments from public.sk_public_accomplishments accomplishment
    where accomplishment.barangay_id = p_barangay_id and accomplishment.status = 'submitted'
      and accomplishment.created_by <> (select auth.uid());
  end if;

  if public.has_tenant_permission(p_barangay_id, 'incident.manage') then
    select count(*) into v_incidents from public.incidents incident_item
    where incident_item.barangay_id = p_barangay_id and incident_item.status in ('submitted', 'acknowledged', 'in_progress');
  end if;

  if public.has_tenant_permission(p_barangay_id, 'referrals.review') then
    select count(*) into v_referrals
    from public.interbarangay_referrals referral
    where referral.receiving_barangay_id = p_barangay_id
      and referral.status in ('submitted', 'acknowledged');
  end if;

  if public.has_tenant_permission(p_barangay_id, 'membership.invite') then
    select count(*) into v_invitations
    from public.invitations invitation
    where invitation.barangay_id = p_barangay_id
      and invitation.status = 'pending'
      and invitation.expires_at > now();
  end if;

  if public.has_tenant_permission(p_barangay_id, 'meeting.manage') then
    select count(*) into v_meeting_resolutions
    from public.meeting_resolutions resolution
    where resolution.barangay_id = p_barangay_id and resolution.status = 'draft'
      and resolution.proposed_by <> (select auth.uid());
  end if;

  return jsonb_build_object(
    'pending_residency_verifications', v_residency,
    'pending_profile_corrections', v_corrections,
    'pending_documents', v_documents,
    'pending_finance', v_finance,
    'pending_health_schedules', v_health,
    'pending_sk_events', v_sk_events,
    'pending_sk_projects', v_sk_projects,
    'pending_sk_accomplishments', v_sk_accomplishments,
    'open_incidents', v_incidents,
    'pending_referrals', v_referrals,
    'pending_invitations', v_invitations,
    'pending_meeting_resolutions', v_meeting_resolutions,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_captain_review_queue_summary(uuid) from public, anon;
grant execute on function public.get_captain_review_queue_summary(uuid) to authenticated;

