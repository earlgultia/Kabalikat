-- Serialize upload starts for a resident so concurrent requests reuse one
-- uploading record instead of racing against the partial unique index.
create or replace function public.start_resident_identity_upload(
  p_barangay_id uuid,
  p_resident_id uuid,
  p_front_extension text,
  p_back_extension text
)
returns table (submission_id uuid, front_storage_path text, back_storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := extensions.gen_random_uuid();
  v_front_extension text := lower(trim(coalesce(p_front_extension, '')));
  v_back_extension text := lower(trim(coalesce(p_back_extension, '')));
  v_existing public.resident_identity_submissions%rowtype;
begin
  if auth.uid() is null or v_front_extension not in ('jpg', 'jpeg', 'png', 'pdf')
    or v_back_extension not in ('jpg', 'jpeg', 'png', 'pdf') then
    raise exception 'Choose a supported image or PDF for both sides of the ID';
  end if;

  if not exists (
    select 1 from public.residents resident
    where resident.id = p_resident_id
      and resident.barangay_id = p_barangay_id
      and resident.user_id = auth.uid()
      and resident.record_status = 'active'
      and public.is_active_member(p_barangay_id)
  ) then
    raise exception 'resident record not found or not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resident-identity-upload:' || p_resident_id::text, 0)
  );

  select * into v_existing
  from public.resident_identity_submissions submission
  where submission.resident_id = p_resident_id
    and submission.status in ('uploading', 'pending', 'verified')
  order by submission.created_at desc
  limit 1
  for update;

  if found then
    if v_existing.status = 'uploading' and v_existing.uploaded_by = auth.uid() then
      return query select v_existing.id, v_existing.front_storage_path, v_existing.back_storage_path;
      return;
    elsif v_existing.status = 'pending' then
      raise exception 'your ID submission is already waiting for review';
    elsif v_existing.status = 'verified' then
      raise exception 'your identity has already been verified';
    else
      raise exception 'an ID upload is already in progress for this resident';
    end if;
  end if;

  insert into public.resident_identity_submissions (
    id, barangay_id, resident_id, uploaded_by, front_storage_path, back_storage_path
  ) values (
    v_id, p_barangay_id, p_resident_id, auth.uid(),
    p_barangay_id::text || '/' || p_resident_id::text || '/' || v_id::text || '/front.' || v_front_extension,
    p_barangay_id::text || '/' || p_resident_id::text || '/' || v_id::text || '/back.' || v_back_extension
  );

  return query select v_id,
    p_barangay_id::text || '/' || p_resident_id::text || '/' || v_id::text || '/front.' || v_front_extension,
    p_barangay_id::text || '/' || p_resident_id::text || '/' || v_id::text || '/back.' || v_back_extension;
end;
$$;

revoke all on function public.start_resident_identity_upload(uuid, uuid, text, text) from public, anon;
grant execute on function public.start_resident_identity_upload(uuid, uuid, text, text) to authenticated;
