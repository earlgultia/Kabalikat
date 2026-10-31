-- Make the private archive searchable without limiting results to the newest 200 files.
create index if not exists archive_documents_tenant_created_page_idx
  on public.archive_documents(barangay_id, created_at desc, id desc);

create index if not exists archive_documents_folder_created_page_idx
  on public.archive_documents(barangay_id, folder_id, created_at desc, id desc);

create or replace function public.search_archive_document_page(
  p_barangay_id uuid,
  p_query text default null,
  p_folder_id uuid default null,
  p_page integer default 0,
  p_page_size integer default 25
)
returns table (
  id uuid,
  folder_id uuid,
  file_name text,
  description text,
  category text,
  mime_type text,
  file_size bigint,
  storage_path text,
  extracted_text text,
  text_status text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if not public.has_tenant_permission(p_barangay_id, 'archive.read') then
    raise exception 'not authorized';
  end if;
  if length(coalesce(p_query, '')) > 120 then
    raise exception 'search query is too long';
  end if;
  if p_folder_id is not null and not exists (
    select 1 from public.archive_folders f
    where f.id = p_folder_id and f.barangay_id = p_barangay_id
  ) then
    raise exception 'archive folder not found';
  end if;

  return query
  with matching as (
    select d.id, d.folder_id, d.file_name, d.description, d.category, d.mime_type,
      d.file_size, d.storage_path, d.extracted_text, d.text_status, d.created_at
    from public.archive_documents d
    where d.barangay_id = p_barangay_id
      and (p_folder_id is null or d.folder_id = p_folder_id)
      and (v_query is null or d.file_name ilike '%' || v_query || '%'
        or d.description ilike '%' || v_query || '%'
        or d.extracted_text ilike '%' || v_query || '%')
  ), counted as (
    select matching.*, count(*) over () as total_count
    from matching
  )
  select counted.id, counted.folder_id, counted.file_name, counted.description, counted.category,
    counted.mime_type, counted.file_size, counted.storage_path, counted.extracted_text,
    counted.text_status, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.search_archive_document_page(uuid, text, uuid, integer, integer) from public, anon;
grant execute on function public.search_archive_document_page(uuid, text, uuid, integer, integer) to authenticated;
