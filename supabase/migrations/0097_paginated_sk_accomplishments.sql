-- Page the public SK accomplishment feed and internal review queue separately.
create index if not exists sk_public_accomplishments_tenant_history_page_idx
  on public.sk_public_accomplishments(barangay_id, status, published_at desc, id desc);

create index if not exists sk_public_accomplishments_review_page_idx
  on public.sk_public_accomplishments(barangay_id, status, created_at desc, id desc);

create or replace function public.list_sk_accomplishment_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_status text default 'published',
  p_year integer default null
)
returns table (
  id uuid,
  project_id uuid,
  title text,
  summary text,
  status text,
  created_by uuid,
  created_at timestamptz,
  published_at timestamptz,
  review_note text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_staff boolean := public.has_tenant_permission(p_barangay_id, 'sk.manage')
    or public.has_tenant_permission(p_barangay_id, 'sk.review');
  v_status text := coalesce(nullif(p_status, ''), 'published');
begin
  if not v_staff and not public.is_active_member(p_barangay_id) then
    raise exception 'not authorized';
  end if;
  if v_status not in ('published', 'review') then
    raise exception 'invalid accomplishment status filter';
  end if;
  if not v_staff and v_status <> 'published' then
    raise exception 'not authorized';
  end if;

  return query
  with matching as (
    select a.id, a.project_id, a.title, a.summary, a.status,
      case when v_staff then a.created_by else null::uuid end as created_by,
      a.created_at, a.published_at,
      case when v_staff then a.review_note else null::text end as review_note
    from public.sk_public_accomplishments a
    where a.barangay_id = p_barangay_id
      and ((v_status = 'published' and a.status = 'published'
            and (p_year is null or extract(year from a.published_at)::integer = p_year))
        or (v_status = 'review' and v_staff and a.status <> 'published'))
  ), counted as (
    select matching.*, count(*) over () as total_count from matching
  )
  select counted.id, counted.project_id, counted.title, counted.summary, counted.status,
    counted.created_by, counted.created_at, counted.published_at, counted.review_note, counted.total_count
  from counted
  order by case when v_status = 'published' then counted.published_at end desc,
    case when v_status = 'review' then counted.created_at end desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

create or replace function public.list_sk_accomplishment_years(p_barangay_id uuid)
returns table (publication_year integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_permission(p_barangay_id, 'sk.manage')
    and not public.has_tenant_permission(p_barangay_id, 'sk.review')
    and not public.is_active_member(p_barangay_id) then
    raise exception 'not authorized';
  end if;

  return query
  select distinct extract(year from a.published_at)::integer
  from public.sk_public_accomplishments a
  where a.barangay_id = p_barangay_id and a.status = 'published'
  order by 1 desc;
end;
$$;

revoke all on function public.list_sk_accomplishment_page(uuid, integer, integer, text, integer) from public, anon;
grant execute on function public.list_sk_accomplishment_page(uuid, integer, integer, text, integer) to authenticated;
revoke all on function public.list_sk_accomplishment_years(uuid) from public, anon;
grant execute on function public.list_sk_accomplishment_years(uuid) to authenticated;
revoke all on function public.list_sk_accomplishments(uuid) from authenticated;
