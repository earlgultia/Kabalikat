-- Platform administrators receive tenant metadata and aggregate member counts only.
create or replace function public.get_platform_barangay_directory()
returns table (
  id uuid, name text, municipality text, province text, code text, status text, created_at timestamptz, active_members bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  return query
    select b.id,b.name,b.municipality,b.province,b.code,b.status,b.created_at,
      count(m.id) filter (where m.status = 'active') as active_members
    from public.barangays b
    left join public.barangay_memberships m on m.barangay_id = b.id
    group by b.id
    order by b.name,b.municipality;
end;
$$;
revoke all on function public.get_platform_barangay_directory() from public,anon;
grant execute on function public.get_platform_barangay_directory() to authenticated;
