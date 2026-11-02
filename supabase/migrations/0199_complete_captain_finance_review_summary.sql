-- Include every finance item awaiting an independent Captain review.
create index if not exists finance_budgets_captain_review_idx
  on public.finance_budgets(barangay_id, created_at desc) where status = 'draft';
create index if not exists financial_transactions_captain_review_idx
  on public.financial_transactions(barangay_id, created_at desc) where status = 'submitted';
create index if not exists finance_budget_amendments_captain_review_idx
  on public.finance_budget_amendments(barangay_id) where status = 'pending';
create index if not exists financial_adjustments_captain_review_idx
  on public.financial_adjustments(barangay_id) where status = 'pending';
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
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;

  if public.has_tenant_permission(p_barangay_id, 'resident.verify') then
    select count(*) into v_residency
    from public.residents resident
    where resident.barangay_id = p_barangay_id and resident.record_status = 'active'
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
    where doc_req.barangay_id = p_barangay_id and doc_req.status in ('pending', 'under_review', 'awaiting_approval');
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
    where campaign.barangay_id = p_barangay_id and campaign.status in ('draft', 'changes_requested');
  end if;

  if public.has_tenant_permission(p_barangay_id, 'sk.event.review') then
    select count(*) into v_sk_events from public.sk_events sk_item
    where sk_item.barangay_id = p_barangay_id and sk_item.status in ('draft', 'changes_requested');
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
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_captain_review_queue_summary(uuid) from public, anon;
grant execute on function public.get_captain_review_queue_summary(uuid) to authenticated;
