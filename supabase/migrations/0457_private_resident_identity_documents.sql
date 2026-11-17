-- Resident identity documents are private verification material. Keep them in
-- a dedicated private bucket and grant read access only to the resident and
-- barangay staff with the explicit identity-review permission.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resident-identity-documents',
  'resident-identity-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into public.permissions (key, description)
values ('resident.identity.review', 'Review a residentâ€™s private identity documents')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.role_definitions role
join public.permissions permission on permission.key = 'resident.identity.review'
where role.key in ('captain', 'secretary')
on conflict do nothing;

create or replace function public.can_review_resident_identity(p_barangay_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.barangay_memberships membership
    join public.role_definitions role on role.id = membership.role_id
    where membership.barangay_id = p_barangay_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and role.key in ('captain', 'secretary')
  );
$$;
revoke all on function public.can_review_resident_identity(uuid) from public, anon;
grant execute on function public.can_review_resident_identity(uuid) to authenticated;

create table public.resident_identity_submissions (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  resident_id uuid not null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  front_storage_path text not null,
  back_storage_path text not null,
  status text not null default 'uploading'
    check (status in ('uploading', 'pending', 'verified', 'rejected')),
  reviewer_id uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (resident_id, barangay_id)
    references public.residents(id, barangay_id) on delete restrict,
  check (front_storage_path <> back_storage_path),
  check (review_note is null or length(review_note) <= 500),
  check ((status in ('verified', 'rejected')) = (reviewed_at is not null)),
  check ((status in ('verified', 'rejected')) = (reviewer_id is not null))
);

create unique index resident_identity_one_open_submission_idx
  on public.resident_identity_submissions (resident_id)
  where status in ('uploading', 'pending');
create index resident_identity_review_queue_idx
  on public.resident_identity_submissions (barangay_id, created_at, id)
  where status = 'pending';

alter table public.resident_identity_submissions enable row level security;
create policy resident_identity_read_own_or_reviewer
  on public.resident_identity_submissions for select to authenticated
  using (
    exists (
      select 1 from public.residents resident
      where resident.id = resident_identity_submissions.resident_id
        and resident.barangay_id = resident_identity_submissions.barangay_id
        and resident.user_id = (select auth.uid())
    )
    or public.can_review_resident_identity(barangay_id)
  );
revoke all on public.resident_identity_submissions from anon, authenticated;
grant select on public.resident_identity_submissions to authenticated;

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

  select * into v_existing
  from public.resident_identity_submissions submission
  where submission.resident_id = p_resident_id
    and submission.status = 'uploading'
    and submission.uploaded_by = auth.uid()
  order by submission.created_at desc
  limit 1;

  if found then
    return query select v_existing.id, v_existing.front_storage_path, v_existing.back_storage_path;
    return;
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

create or replace function public.complete_resident_identity_upload(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.resident_identity_submissions%rowtype;
begin
  select * into v_submission
  from public.resident_identity_submissions submission
  where submission.id = p_submission_id
    and submission.uploaded_by = auth.uid()
    and submission.status = 'uploading'
  for update;
  if not found then raise exception 'identity upload is unavailable'; end if;

  if not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'resident-identity-documents'
        and object.name = v_submission.front_storage_path
        and case when object.metadata ->> 'size' ~ '^[0-9]+$' then (object.metadata ->> 'size')::bigint else 0 end between 1 and 10485760
    ) or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'resident-identity-documents'
        and object.name = v_submission.back_storage_path
        and case when object.metadata ->> 'size' ~ '^[0-9]+$' then (object.metadata ->> 'size')::bigint else 0 end between 1 and 10485760
    ) then
    raise exception 'upload both sides of the ID before submitting';
  end if;

  update public.resident_identity_submissions
  set status = 'pending', updated_at = now()
  where id = v_submission.id;
end;
$$;

create or replace function public.require_verified_identity_for_resident_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.residents resident
    where resident.id = new.resident_id
      and resident.barangay_id = new.barangay_id
      and resident.user_id = auth.uid()
  ) and not exists (
    select 1 from public.resident_identity_submissions submission
    where submission.resident_id = new.resident_id
      and submission.barangay_id = new.barangay_id
      and submission.status = 'verified'
  ) then
    raise exception 'verify the front and back of a valid ID before requesting barangay documents';
  end if;
  return new;
end;
$$;

revoke all on function public.require_verified_identity_for_resident_requests() from public, anon, authenticated;
drop trigger if exists document_requests_require_verified_identity on public.document_requests;
create trigger document_requests_require_verified_identity
  before insert on public.document_requests
  for each row execute function public.require_verified_identity_for_resident_requests();

create or replace function public.review_resident_identity_submission(
  p_submission_id uuid,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.resident_identity_submissions%rowtype;
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
begin
  select * into v_submission
  from public.resident_identity_submissions submission
  where submission.id = p_submission_id
  for update;
  if not found or not public.can_review_resident_identity(v_submission.barangay_id) then
    raise exception 'not authorized';
  end if;
  if v_submission.status <> 'pending' or p_decision not in ('verified', 'rejected') then
    raise exception 'identity submission is not awaiting review';
  end if;
  if p_decision = 'rejected' and length(coalesce(v_note, '')) not between 3 and 500 then
    raise exception 'provide a short reason so the resident can submit a clearer ID';
  end if;

  update public.resident_identity_submissions
  set status = p_decision,
      reviewer_id = auth.uid(),
      reviewed_at = now(),
      review_note = case when p_decision = 'rejected' then v_note else null end,
      updated_at = now()
  where id = v_submission.id;
end;
$$;

revoke all on function public.start_resident_identity_upload(uuid, uuid, text, text) from public, anon;
revoke all on function public.complete_resident_identity_upload(uuid) from public, anon;
revoke all on function public.review_resident_identity_submission(uuid, text, text) from public, anon;
grant execute on function public.start_resident_identity_upload(uuid, uuid, text, text) to authenticated;
grant execute on function public.complete_resident_identity_upload(uuid) to authenticated;
grant execute on function public.review_resident_identity_submission(uuid, text, text) to authenticated;

create policy resident_identity_upload_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resident-identity-documents'
    and exists (
      select 1 from public.resident_identity_submissions submission
      where submission.uploaded_by = (select auth.uid())
        and submission.status = 'uploading'
        and name in (submission.front_storage_path, submission.back_storage_path)
    )
  );
create policy resident_identity_upload_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'resident-identity-documents'
    and exists (
      select 1 from public.resident_identity_submissions submission
      where submission.uploaded_by = (select auth.uid())
        and submission.status = 'uploading'
        and name in (submission.front_storage_path, submission.back_storage_path)
    )
  )
  with check (
    bucket_id = 'resident-identity-documents'
    and exists (
      select 1 from public.resident_identity_submissions submission
      where submission.uploaded_by = (select auth.uid())
        and submission.status = 'uploading'
        and name in (submission.front_storage_path, submission.back_storage_path)
    )
  );
create policy resident_identity_private_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resident-identity-documents'
    and exists (
      select 1 from public.resident_identity_submissions submission
      where name in (submission.front_storage_path, submission.back_storage_path)
        and (
          submission.uploaded_by = (select auth.uid())
          or public.can_review_resident_identity(submission.barangay_id)
        )
    )
  );


