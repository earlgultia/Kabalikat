-- Return request history only to staff who can review the queue or the request's resident.
create or replace function public.list_document_request_activity(p_barangay_id uuid)
returns table (
  request_id uuid,
  from_status text,
  to_status text,
  reason text,
  actor_name text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'document.request.read')
    and not exists (
      select 1 from public.document_requests d
      join public.residents r on r.id = d.resident_id and r.barangay_id = d.barangay_id
      where d.barangay_id = p_barangay_id and r.user_id = auth.uid()
    ) then raise exception 'not authorized'; end if;

  return query
    select e.request_id,e.from_status,e.to_status,e.reason,
      case when e.actor_id = auth.uid() then 'You'
        else coalesce(nullif(p.display_name,''),'Workspace member') end,
      e.created_at
    from public.document_request_events e
    join public.document_requests d on d.id = e.request_id and d.barangay_id = e.barangay_id
    join public.profiles p on p.id = e.actor_id
    where e.barangay_id = p_barangay_id
      and (public.has_tenant_permission(p_barangay_id,'document.request.read')
        or exists (select 1 from public.residents r where r.id = d.resident_id and r.user_id = auth.uid()))
    order by e.created_at desc limit 1000;
end;
$$;
revoke all on function public.list_document_request_activity(uuid) from public,anon;
grant execute on function public.list_document_request_activity(uuid) to authenticated;
