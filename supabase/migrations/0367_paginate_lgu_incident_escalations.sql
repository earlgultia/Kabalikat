-- Keep municipal incident queues bounded as escalated reports accumulate.
create or replace function public.list_lgu_incident_escalations_page(
  p_status text default 'all', p_page integer default 0, p_page_size integer default 25
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_lgu_id uuid; v_total bigint; v_rows jsonb;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  if v_lgu_id is null then raise exception 'active LGU administrator access is required'; end if;
  if p_status is null or p_status not in ('all','pending','acknowledged','resolved') then raise exception 'invalid escalation filter'; end if;
  if p_page is null or p_page < 0 or p_page > 1000000 then raise exception 'invalid page'; end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then raise exception 'page size must be between 1 and 100'; end if;

  with filtered as (
    select escalation.id,incident.id as incident_id,barangay.id as barangay_id,barangay.name as barangay_name,
      incident.category,incident.severity,incident.location,incident.summary,incident.details,
      incident.status as incident_status,escalation.escalation_note,escalation.status,
      escalation.lgu_response_note,escalation.created_at,escalation.updated_at,
      case escalation.status when 'pending' then 0 when 'acknowledged' then 1 else 2 end as sort_rank
    from public.lgu_incident_escalations escalation
    join public.incidents incident on incident.id = escalation.incident_id and incident.barangay_id = escalation.barangay_id
    join public.barangays barangay on barangay.id = escalation.barangay_id and barangay.lgu_id = v_lgu_id
    where escalation.lgu_id = v_lgu_id and (p_status = 'all' or escalation.status = p_status)
  )
  select (select count(*) from filtered),
    coalesce((select jsonb_agg(to_jsonb(page_row) - 'sort_rank'
      order by page_row.sort_rank,page_row.created_at desc,page_row.id)
      from (select * from filtered order by sort_rank,created_at desc,id
        limit p_page_size offset (p_page * p_page_size)) page_row),'[]'::jsonb)
  into v_total,v_rows;
  return jsonb_build_object('total_count',v_total,'rows',v_rows);
end;
$$;

revoke all on function public.list_lgu_incident_escalations_page(text,integer,integer) from public,anon;
grant execute on function public.list_lgu_incident_escalations_page(text,integer,integer) to authenticated;
