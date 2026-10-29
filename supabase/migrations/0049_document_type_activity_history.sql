-- Let document setup managers review configuration changes without direct
-- read access to the private audit table or the actors' account IDs.
create or replace function public.list_document_type_activity(p_barangay_id uuid)
returns table (
  activity_id uuid,
  document_type_id uuid,
  document_type_name text,
  action text,
  actor_name text,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'document.type.manage') then
    raise exception 'not authorized';
  end if;
  return query
    select e.id,e.document_type_id,t.name,e.action,
      coalesce(nullif(p.display_name,''),'Workspace member'),e.previous_values,e.new_values,e.created_at
    from public.document_type_events e
    join public.document_types t on t.id = e.document_type_id and t.barangay_id = e.barangay_id
    left join public.profiles p on p.id = e.actor_id
    where e.barangay_id = p_barangay_id
    order by e.created_at desc,e.id desc;
end;
$$;
revoke all on function public.list_document_type_activity(uuid) from public,anon;
grant execute on function public.list_document_type_activity(uuid) to authenticated;
