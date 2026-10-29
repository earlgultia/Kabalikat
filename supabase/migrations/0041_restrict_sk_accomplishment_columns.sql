-- Remove direct table reads so public workspace members cannot query internal author/reviewer fields.
revoke select on public.sk_public_accomplishments from authenticated;

create or replace function public.list_sk_accomplishments(p_barangay_id uuid)
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
declare v_staff boolean;
begin
  v_staff := public.has_tenant_permission(p_barangay_id,'sk.manage')
    or public.has_tenant_permission(p_barangay_id,'sk.review');
  if not v_staff and not public.is_active_member(p_barangay_id) then raise exception 'not authorized'; end if;
  return query
    select a.id,a.barangay_id,a.project_id,a.title,a.summary,a.status,
      case when v_staff then a.created_by else null::uuid end,
      a.created_at,a.published_at,
      case when v_staff then a.review_note else null::text end
    from public.sk_public_accomplishments a
    where a.barangay_id = p_barangay_id and (v_staff or a.status = 'published')
    order by coalesce(a.published_at,a.created_at) desc;
end;
$$;
revoke all on function public.list_sk_accomplishments(uuid) from public,anon;
grant execute on function public.list_sk_accomplishments(uuid) to authenticated;
