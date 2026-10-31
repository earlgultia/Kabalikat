-- Aggregate summary follows the caller's RLS-visible campaign set.
create or replace function public.get_health_outreach_campaign_summary(
  p_barangay_id uuid,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  total_count bigint,
  completed_count bigint,
  total_attendance bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_search text := lower(nullif(left(trim(coalesce(p_search, '')), 100), ''));
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'draft', 'published', 'completed', 'cancelled') then
    raise exception 'invalid health outreach status filter';
  end if;

  return query
  select count(*)::bigint,
    count(*) filter (where campaign.status = 'completed')::bigint,
    coalesce(sum(campaign.attendance_count), 0)::bigint
  from public.health_outreach_campaigns campaign
  where campaign.barangay_id = p_barangay_id
    and (v_status = 'all' or campaign.status = v_status)
    and (v_search is null or position(v_search in lower(concat_ws(' ', campaign.title, campaign.description, campaign.location))) > 0);
end;
$$;
revoke all on function public.get_health_outreach_campaign_summary(uuid, text, text) from public, anon;
grant execute on function public.get_health_outreach_campaign_summary(uuid, text, text) to authenticated;
