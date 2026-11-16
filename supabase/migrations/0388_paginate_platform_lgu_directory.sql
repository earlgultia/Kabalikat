-- Bound Super Admin municipality directory reads as the number of LGUs grows.
create index if not exists lgu_invitations_lgu_pending_latest_idx
  on public.lgu_invitations(lgu_id,created_at desc,id desc)
  where status = 'pending';

create or replace function public.list_platform_lgu_directory_page(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := coalesce(p_page,0);
  v_page_size integer := coalesce(p_page_size,25);
  v_search text := nullif(trim(coalesce(p_search,'')),'');
  v_total bigint;
  v_rows jsonb;
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if v_page < 0 or v_page > 1000000 then
    raise exception 'invalid page';
  end if;
  if v_page_size < 1 or v_page_size > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if length(coalesce(v_search,'')) > 160 then
    raise exception 'search is too long';
  end if;

  with directory as (
    select lgu.id as lgu_id,lgu.municipality,lgu.province,lgu.status,
      exists(select 1 from public.lgu_memberships membership
        where membership.lgu_id = lgu.id and membership.status = 'active') as administrator_active,
      (select count(*) from public.barangays barangay where barangay.lgu_id = lgu.id) as barangay_count,
      invitation.invited_email as pending_invited_email,
      invitation.expires_at as pending_invitation_expires_at,
      lgu.created_at
    from public.local_government_units lgu
    left join lateral (
      select pending.invited_email::text as invited_email,pending.expires_at
      from public.lgu_invitations pending
      where pending.lgu_id = lgu.id and pending.status = 'pending' and pending.expires_at > now()
      order by pending.created_at desc,pending.id desc
      limit 1
    ) invitation on true
    where v_search is null
      or position(lower(v_search) in lower(concat_ws(' ',lgu.municipality,lgu.province))) > 0
  ), paged as (
    select directory.* from directory
    order by directory.municipality,directory.province,directory.lgu_id
    limit v_page_size offset (v_page * v_page_size)
  )
  select (select count(*) from directory),
    coalesce((select jsonb_agg(to_jsonb(page_row) order by page_row.municipality,page_row.province,page_row.lgu_id)
      from paged page_row),'[]'::jsonb)
  into v_total,v_rows;

  return jsonb_build_object('total_count',v_total,'rows',v_rows);
end;
$$;

revoke all on function public.list_platform_lgu_directory_page(integer,integer,text) from public,anon;
grant execute on function public.list_platform_lgu_directory_page(integer,integer,text) to authenticated;

-- Some installations may not have created the legacy unpaged endpoint.
do $$
begin
  if to_regprocedure('public.list_platform_lgu_directory()') is not null then
    execute 'revoke all on function public.list_platform_lgu_directory() from public,anon,authenticated';
  end if;
end;
$$;
