-- Let active members inspect the published history of a rescheduled SK event.
create or replace function public.list_sk_event_schedule_change_history(
  p_barangay_id uuid,p_event_id uuid,p_page integer default 0,p_page_size integer default 10
)
returns table (
  id uuid,reason text,previous_location text,previous_starts_at timestamptz,
  previous_ends_at timestamptz,new_location text,new_starts_at timestamptz,
  new_ends_at timestamptz,created_at timestamptz,total_count bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page integer := least(greatest(coalesce(p_page,0),0),10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size,10),1),50);
begin
  if not public.is_active_member(p_barangay_id) then
    raise exception 'not authorized';
  end if;
  return query
  with history as (
    select change.id,change.reason,change.previous_location,change.previous_starts_at,
      change.previous_ends_at,change.new_location,change.new_starts_at,change.new_ends_at,
      change.created_at,count(*) over () as total_count
    from public.sk_event_schedule_changes change
    join public.sk_events event on event.id = change.event_id and event.barangay_id = change.barangay_id
    where change.barangay_id = p_barangay_id and change.event_id = p_event_id
      and event.status in ('published','completed','cancelled')
  )
  select history.id,history.reason,history.previous_location,history.previous_starts_at,
    history.previous_ends_at,history.new_location,history.new_starts_at,history.new_ends_at,
    history.created_at,history.total_count
  from history order by history.created_at desc,history.id desc
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;
revoke all on function public.list_sk_event_schedule_change_history(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.list_sk_event_schedule_change_history(uuid,uuid,integer,integer) to authenticated;
