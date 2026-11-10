-- Include SK workspace metrics in the shared dashboard summary. SK Chairpersons
-- have dedicated permissions and should not need unrelated barangay permissions
-- just to load their overview.
create or replace function public.get_workspace_dashboard_metrics(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_residents bigint;
  v_documents bigint;
  v_meetings bigint;
  v_finance bigint;
  v_announcements bigint;
  v_sk_projects bigint;
  v_upcoming_sk_events bigint;
begin
  if auth.uid() is null or not public.is_active_member(p_barangay_id) then
    raise exception 'not authorized';
  end if;

  if public.has_tenant_permission(p_barangay_id, 'resident.update') then
    select count(*) into v_residents from public.residents r
    where r.barangay_id = p_barangay_id and r.record_status = 'active';
  end if;
  if public.has_tenant_permission(p_barangay_id, 'document.request.read') then
    select count(*) into v_documents from public.document_requests d
    where d.barangay_id = p_barangay_id and d.status in ('pending', 'under_review', 'awaiting_approval');
  end if;
  if public.has_tenant_permission(p_barangay_id, 'meeting.read') then
    select count(*) into v_meetings from public.meetings m
    where m.barangay_id = p_barangay_id and m.status = 'scheduled' and m.starts_at >= now();
  end if;
  if public.has_tenant_permission(p_barangay_id, 'finance.read') then
    select count(*) into v_finance from public.financial_transactions t
    where t.barangay_id = p_barangay_id and t.status = 'submitted';
  end if;
  if public.has_tenant_permission(p_barangay_id, 'announcement.publish') then
    select count(*) into v_announcements from public.announcements a
    where a.barangay_id = p_barangay_id and a.status = 'published'
      and (a.expires_at is null or a.expires_at > now());
  end if;
  if public.has_tenant_permission(p_barangay_id, 'sk.manage') then
    select count(*) into v_sk_projects from public.sk_projects p
    where p.barangay_id = p_barangay_id and p.status in ('submitted', 'approved', 'active');
  end if;
  if public.has_tenant_permission(p_barangay_id, 'sk.event.manage') then
    select count(*) into v_upcoming_sk_events from public.sk_events e
    where e.barangay_id = p_barangay_id and e.status = 'published' and e.starts_at >= now();
  end if;

  return jsonb_build_object(
    'residents', v_residents,
    'pending_documents', v_documents,
    'upcoming_meetings', v_meetings,
    'pending_finance', v_finance,
    'published_announcements', v_announcements,
    'sk_projects', v_sk_projects,
    'upcoming_sk_events', v_upcoming_sk_events,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_workspace_dashboard_metrics(uuid) from public, anon;
grant execute on function public.get_workspace_dashboard_metrics(uuid) to authenticated;
