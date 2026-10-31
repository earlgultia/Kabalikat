-- Page SK project proposals and load their related records only for visible projects.
create index if not exists sk_projects_tenant_created_page_idx
  on public.sk_projects(barangay_id, created_at desc, id desc);

create or replace function public.list_sk_accomplishments_for_projects(
  p_barangay_id uuid,
  p_project_ids uuid[]
)
returns table (
  id uuid,
  barangay_id uuid,
  project_id uuid,
  title text,
  summary text,
  status text,
  created_by uuid,
  created_at timestamptz,
  published_at timestamptz,
  review_note text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_staff boolean;
begin
  v_staff := public.has_tenant_permission(p_barangay_id, 'sk.manage')
    or public.has_tenant_permission(p_barangay_id, 'sk.review');
  if not v_staff then raise exception 'not authorized'; end if;
  if coalesce(cardinality(p_project_ids), 0) > 20 then raise exception 'too many projects requested'; end if;

  return query
    select a.id, a.barangay_id, a.project_id, a.title, a.summary, a.status,
      a.created_by, a.created_at, a.published_at, a.review_note
    from public.sk_public_accomplishments a
    where a.barangay_id = p_barangay_id and a.project_id = any(coalesce(p_project_ids, '{}'::uuid[]))
    order by coalesce(a.published_at, a.created_at) desc, a.id desc;
end;
$$;
revoke all on function public.list_sk_accomplishments_for_projects(uuid, uuid[]) from public, anon;
grant execute on function public.list_sk_accomplishments_for_projects(uuid, uuid[]) to authenticated;

create or replace function public.list_sk_project_activity_for_projects(
  p_barangay_id uuid,
  p_project_ids uuid[]
)
returns table (
  project_id uuid,
  action text,
  details text,
  actor_name text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_tenant_permission(p_barangay_id, 'sk.manage')
    or public.has_tenant_permission(p_barangay_id, 'sk.review')) then
    raise exception 'not authorized';
  end if;
  if coalesce(cardinality(p_project_ids), 0) > 20 then raise exception 'too many projects requested'; end if;

  return query
    select e.project_id, e.action, e.details,
      coalesce(nullif(p.display_name, ''), 'Workspace member')::text, e.created_at
    from public.sk_project_events e
    join public.profiles p on p.id = e.actor_id
    where e.barangay_id = p_barangay_id
      and e.project_id = any(coalesce(p_project_ids, '{}'::uuid[]))
    order by e.created_at desc, e.project_id, e.action
    limit 500;
end;
$$;
revoke all on function public.list_sk_project_activity_for_projects(uuid, uuid[]) from public, anon;
grant execute on function public.list_sk_project_activity_for_projects(uuid, uuid[]) to authenticated;
