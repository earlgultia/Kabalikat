-- Show SK project audit records to the two roles already authorized to manage/review them.
create or replace function public.list_sk_project_activity(p_barangay_id uuid)
returns table (
  project_id uuid,
  action text,
  details text,
  actor_name text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_tenant_permission(p_barangay_id,'sk.manage')
    or public.has_tenant_permission(p_barangay_id,'sk.review')) then raise exception 'not authorized'; end if;
  return query
    select e.project_id,e.action,e.details,coalesce(nullif(p.display_name,''),'Workspace member'),e.created_at
    from public.sk_project_events e
    join public.profiles p on p.id = e.actor_id
    where e.barangay_id = p_barangay_id
    order by e.created_at desc limit 500;
end;
$$;
revoke all on function public.list_sk_project_activity(uuid) from public,anon;
grant execute on function public.list_sk_project_activity(uuid) to authenticated;
