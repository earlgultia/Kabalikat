-- Return only the requested LGU directory page instead of loading every
-- municipality workspace into the browser.
create index if not exists barangays_lgu_directory_page_idx
  on public.barangays(lgu_id,name,id)
  where lgu_id is not null;

create or replace function public.list_lgu_barangay_directory_page(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_needs_captain boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lgu_id uuid;
  v_page integer := coalesce(p_page,0);
  v_page_size integer := coalesce(p_page_size,25);
  v_search text := nullif(trim(coalesce(p_search,'')),'');
  v_total bigint;
  v_rows jsonb;
begin
  select membership.lgu_id into v_lgu_id
  from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at,membership.id
  limit 1;
  if v_lgu_id is null then
    raise exception 'active LGU administrator access is required';
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

  with filtered as (
    select barangay.id,barangay.name,barangay.municipality,barangay.province,
      barangay.code,barangay.status,barangay.created_at,
      exists(select 1 from public.barangay_memberships captain
        join public.role_definitions role on role.id = captain.role_id and role.key = 'captain'
        where captain.barangay_id = barangay.id and captain.status = 'active') as captain_active
    from public.barangays barangay
    where barangay.lgu_id = v_lgu_id
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ',barangay.name,barangay.code))) > 0)
  ), paged as (
    select filtered.* from filtered
    where not coalesce(p_needs_captain,false)
      or (filtered.status = 'active' and not filtered.captain_active)
    order by filtered.name,filtered.id
    limit v_page_size offset (v_page * v_page_size)
  )
  select (select count(*) from filtered where not coalesce(p_needs_captain,false)
        or (filtered.status = 'active' and not filtered.captain_active)),
    coalesce((select jsonb_agg(to_jsonb(directory_row) order by directory_row.name,directory_row.id)
      from (
        select paged.id,paged.name,paged.municipality,paged.province,paged.code,paged.status,
          (select count(*) from public.barangay_memberships member
            where member.barangay_id = paged.id and member.status = 'active') as active_members,
          paged.captain_active,
          invitation.invited_email as pending_captain_email,
          invitation.expires_at as pending_captain_invite_expires_at,
          paged.created_at
        from paged
        left join lateral (
          select invite.invited_email::text as invited_email,invite.expires_at
          from public.invitations invite
          join public.role_definitions role on role.id = invite.role_id and role.key = 'captain'
          where invite.barangay_id = paged.id and invite.status = 'pending' and invite.expires_at > now()
          order by invite.created_at desc,invite.id desc
          limit 1
        ) invitation on true
      ) directory_row),'[]'::jsonb)
  into v_total,v_rows;

  return jsonb_build_object('total_count',v_total,'rows',v_rows);
end;
$$;

revoke all on function public.list_lgu_barangay_directory_page(integer,integer,text,boolean) from public,anon;
grant execute on function public.list_lgu_barangay_directory_page(integer,integer,text,boolean) to authenticated;

-- Remove access to the legacy unbounded directory endpoint.
do $$
begin
  if to_regprocedure('public.list_lgu_barangay_directory()') is not null then
    execute 'revoke all on function public.list_lgu_barangay_directory() from public,anon,authenticated';
  end if;
  if to_regprocedure('public.list_lgu_barangays()') is not null then
    execute 'revoke all on function public.list_lgu_barangays() from public,anon,authenticated';
  end if;
end;
$$;
