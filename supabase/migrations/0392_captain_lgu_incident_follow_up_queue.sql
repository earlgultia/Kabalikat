-- Give Captains a bounded, actionable list of active municipal handoffs.
create or replace function public.list_captain_lgu_incident_follow_up_page(
  p_barangay_id uuid,
  p_status text default 'all',
  p_page integer default 0,
  p_page_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := coalesce(p_page,0);
  v_page_size integer := coalesce(p_page_size,10);
  v_total bigint;
  v_rows jsonb;
begin
  if not public.has_tenant_permission(p_barangay_id,'incident.manage')
    or not exists (
      select 1 from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'captain'
    ) then
    raise exception 'only the active Barangay Captain may view LGU incident follow-up';
  end if;
  if p_status is null or p_status not in ('all','pending','acknowledged') then
    raise exception 'invalid LGU follow-up status';
  end if;
  if v_page < 0 or v_page > 1000000 then
    raise exception 'invalid page';
  end if;
  if v_page_size < 1 or v_page_size > 50 then
    raise exception 'page size must be between 1 and 50';
  end if;

  with matching as (
    select escalation.incident_id,incident.summary,incident.severity,incident.status as report_status,
      escalation.status as escalation_status,escalation.lgu_response_note as response_note,
      escalation.updated_at as escalation_updated_at
    from public.lgu_incident_escalations escalation
    join public.incidents incident
      on incident.id = escalation.incident_id and incident.barangay_id = escalation.barangay_id
    where escalation.barangay_id = p_barangay_id
      and escalation.status in ('pending','acknowledged')
      and (p_status = 'all' or escalation.status = p_status)
  ), paged as (
    select matching.* from matching
    order by case matching.escalation_status when 'pending' then 0 else 1 end,
      matching.escalation_updated_at desc,matching.incident_id desc
    limit v_page_size offset (v_page * v_page_size)
  )
  select (select count(*) from matching),
    coalesce((select jsonb_agg(to_jsonb(page_row) order by
      case page_row.escalation_status when 'pending' then 0 else 1 end,
      page_row.escalation_updated_at desc,page_row.incident_id desc)
      from paged page_row),'[]'::jsonb)
  into v_total,v_rows;

  return jsonb_build_object('total_count',v_total,'rows',v_rows);
end;
$$;

revoke all on function public.list_captain_lgu_incident_follow_up_page(uuid,text,integer,integer) from public,anon;
grant execute on function public.list_captain_lgu_incident_follow_up_page(uuid,text,integer,integer) to authenticated;
