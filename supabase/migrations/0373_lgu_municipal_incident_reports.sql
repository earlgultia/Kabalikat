-- Give active LGU administrators read-only visibility into every incident in their municipality.
create or replace function public.list_lgu_municipal_incident_reports(
  p_page integer default 0,p_page_size integer default 25,p_search text default null,
  p_status text default 'all',p_severity text default 'all',p_created_after date default null,p_created_before date default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_lgu_id uuid;
  v_page integer := coalesce(p_page,0);
  v_page_size integer := coalesce(p_page_size,25);
  v_search text := nullif(trim(coalesce(p_search,'')), '');
  v_from timestamptz;
  v_until timestamptz;
  v_total bigint;
  v_rows jsonb;
begin
  select membership.lgu_id into v_lgu_id
  from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  if v_lgu_id is null then raise exception 'active LGU administrator access is required'; end if;
  if v_page < 0 or v_page > 1000000 then raise exception 'invalid page'; end if;
  if v_page_size < 1 or v_page_size > 100 then raise exception 'page size must be between 1 and 100'; end if;
  if length(coalesce(v_search,'')) > 160 then raise exception 'search is too long'; end if;
  if p_status is null or p_status not in ('all','submitted','acknowledged','in_progress','resolved','closed') then raise exception 'invalid incident status filter'; end if;
  if p_severity is null or p_severity not in ('all','urgent','high','moderate','low') then raise exception 'invalid incident severity filter'; end if;
  if p_created_after is not null and p_created_before is not null and p_created_after > p_created_before then
    raise exception 'the start date must be on or before the end date';
  end if;
  if p_created_after is not null then v_from := p_created_after::timestamp at time zone 'Asia/Manila'; end if;
  if p_created_before is not null then v_until := (p_created_before + 1)::timestamp at time zone 'Asia/Manila'; end if;

  with filtered as (
    select incident.id,incident.barangay_id,barangay.name as barangay_name,
      incident.category,incident.severity,incident.location,incident.summary,incident.details,
      incident.status,incident.created_at,incident.updated_at,
      escalation.status as escalation_status,escalation.escalation_note,escalation.lgu_response_note
    from public.barangays barangay
    join public.incidents incident on incident.barangay_id = barangay.id
    left join public.lgu_incident_escalations escalation on escalation.incident_id = incident.id
      and escalation.barangay_id = incident.barangay_id and escalation.lgu_id = v_lgu_id
    where barangay.lgu_id = v_lgu_id and incident.barangay_id = barangay.id
      and (p_status = 'all' or incident.status = p_status)
      and (p_severity = 'all' or incident.severity = p_severity)
      and (v_from is null or incident.created_at >= v_from)
      and (v_until is null or incident.created_at < v_until)
      and (v_search is null or incident.summary ilike '%' || v_search || '%'
        or incident.location ilike '%' || v_search || '%'
        or incident.category ilike '%' || v_search || '%'
        or barangay.name ilike '%' || v_search || '%')
  )
  select (select count(*) from filtered),
    coalesce((select jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc,page_row.id desc)
      from (select * from filtered order by created_at desc,id desc
        limit v_page_size offset (v_page * v_page_size)) page_row),'[]'::jsonb)
  into v_total,v_rows;
  return jsonb_build_object('total_count',v_total,'rows',v_rows);
end;
$$;

revoke all on function public.list_lgu_municipal_incident_reports(integer,integer,text,text,text,date,date) from public,anon;
grant execute on function public.list_lgu_municipal_incident_reports(integer,integer,text,text,text,date,date) to authenticated;
