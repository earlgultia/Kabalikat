-- If either side of a resident ID upload fails, remove its incomplete
-- submission immediately and queue both possible Storage objects for cleanup.
create or replace function public.cancel_resident_identity_upload(p_submission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.resident_identity_submissions%rowtype;
begin
  if auth.uid() is null or p_submission_id is null then
    return false;
  end if;

  select * into v_submission
  from public.resident_identity_submissions submission
  where submission.id = p_submission_id
  for update;

  if not found
    or v_submission.uploaded_by <> auth.uid()
    or v_submission.status <> 'uploading' then
    return false;
  end if;

  insert into public.resident_identity_file_erasure_queue(bucket_id, object_path)
  values
    ('resident-identity-documents', v_submission.front_storage_path),
    ('resident-identity-documents', v_submission.back_storage_path)
  on conflict (bucket_id, object_path) do nothing;

  delete from public.resident_identity_submissions submission
  where submission.id = v_submission.id;

  return true;
end;
$$;

revoke all on function public.cancel_resident_identity_upload(uuid) from public, anon;
grant execute on function public.cancel_resident_identity_upload(uuid) to authenticated;
