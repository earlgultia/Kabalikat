-- KABALIKAT Phase 2: onboarding and core barangay operations.
create extension if not exists citext with schema extensions;

insert into public.permissions (key, description) values
  ('resident.create', 'Create resident records'),
  ('resident.update', 'Update resident records'),
  ('resident.verify', 'Verify residency records'),
  ('household.manage', 'Create and manage household records'),
  ('membership.invite', 'Create and accept staff or resident invitations'),
  ('document.request.create', 'Submit document requests'),
  ('document.request.read', 'Read tenant document requests'),
  ('document.request.review', 'Review document requests'),
  ('document.issue', 'Issue and release official documents'),
  ('announcement.read', 'Read tenant announcements'),
  ('announcement.publish', 'Create and publish announcements'),
  ('meeting.read', 'Read meetings and agendas'),
  ('meeting.manage', 'Create and manage meetings'),
  ('attendance.read', 'Read meeting attendance'),
  ('attendance.manage', 'Record and correct attendance')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.role_definitions r
cross join public.permissions p
where (r.key = 'captain' and p.key in (
  'resident.create','resident.update','resident.verify','household.manage',
  'membership.invite','document.request.create','document.request.read',
  'document.request.review','document.issue','announcement.read','announcement.publish',
  'meeting.read','meeting.manage','attendance.read','attendance.manage'
))
or (r.key = 'secretary' and p.key in (
  'resident.create','resident.update','resident.verify','household.manage',
  'document.request.create','document.request.read','document.request.review','document.issue',
  'announcement.read','announcement.publish','meeting.read','meeting.manage','attendance.read','attendance.manage'
))
or (r.key = 'kagawad' and p.key in ('meeting.read','attendance.read'))
or (r.key = 'resident' and p.key in ('document.request.create','announcement.read'))
on conflict do nothing;

-- Phase 1 granted broad meeting management to Kagawad; Phase 2 keeps this role read-only.
delete from public.role_permissions rp
using public.role_definitions r, public.permissions p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.key = 'kagawad' and p.key = 'meeting.manage';

create policy profiles_read_tenant_members on public.profiles for select to authenticated
using (exists (
  select 1 from public.barangay_memberships m
  where m.user_id = profiles.id
    and m.status = 'active'
    and public.has_tenant_permission(m.barangay_id, 'membership.read')
));

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  invited_email extensions.citext not null,
  role_id uuid not null references public.role_definitions(id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'accepted') = (accepted_at is not null))
);
create index invitations_tenant_status_idx on public.invitations(barangay_id, status, expires_at);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  household_code text not null,
  address_line text not null,
  purok text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barangay_id, household_code),
  unique (id, barangay_id),
  check (length(trim(address_line)) between 3 and 250),
  check (purok is null or length(purok) <= 100)
);

create table public.residents (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete restrict,
  first_name text not null,
  middle_name text,
  last_name text not null,
  suffix text,
  birth_date date,
  phone text,
  household_id uuid,
  record_status text not null default 'active' check (record_status in ('active','inactive','deceased')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barangay_id, user_id),
  unique (id, barangay_id),
  check (length(trim(first_name)) between 1 and 100),
  check (length(trim(last_name)) between 1 and 100),
  check (phone is null or length(phone) <= 40),
  foreign key (household_id, barangay_id) references public.households(id, barangay_id) on delete restrict
);
create index residents_tenant_name_idx on public.residents(barangay_id, last_name, first_name);
create index residents_user_idx on public.residents(user_id) where user_id is not null;

create table public.residency_verifications (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  resident_id uuid not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  verified_by uuid references public.profiles(id) on delete restrict,
  verified_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (resident_id, barangay_id) references public.residents(id, barangay_id) on delete restrict,
  check ((status = 'pending' and verified_at is null) or (status <> 'pending' and verified_at is not null))
);
create index residency_verification_tenant_idx on public.residency_verifications(barangay_id, status);

create table public.household_members (
  barangay_id uuid not null,
  household_id uuid not null,
  resident_id uuid not null,
  relationship text,
  is_head boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (household_id, resident_id),
  foreign key (household_id, barangay_id) references public.households(id, barangay_id) on delete restrict,
  foreign key (resident_id, barangay_id) references public.residents(id, barangay_id) on delete restrict
);

create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  code text not null,
  name text not null,
  description text not null default '',
  public_request_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (barangay_id, code),
  unique (id, barangay_id)
);

insert into public.document_types(barangay_id, code, name, description)
select b.id, d.code, d.name, d.description
from public.barangays b
cross join (values
  ('BARANGAY_CERTIFICATE', 'Barangay Certificate', 'Certificate of residency or community standing'),
  ('BARANGAY_CLEARANCE', 'Barangay Clearance', 'Barangay clearance application'),
  ('INDIGENCY_CERTIFICATE', 'Certificate of Indigency', 'Certificate of indigency application')
) as d(code, name, description)
on conflict (barangay_id, code) do nothing;

create table public.document_requests (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  reference_number text not null,
  resident_id uuid not null,
  document_type_id uuid not null,
  purpose text not null,
  status text not null default 'pending' check (status in (
    'pending','under_review','awaiting_approval','approved','rejected','issued','released','cancelled'
  )),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  unique (barangay_id, reference_number),
  unique (id, barangay_id),
  foreign key (resident_id, barangay_id) references public.residents(id, barangay_id) on delete restrict,
  foreign key (document_type_id, barangay_id) references public.document_types(id, barangay_id) on delete restrict,
  check ((status = 'rejected') = (rejection_reason is not null)),
  check (length(trim(purpose)) between 3 and 500)
);
create index document_requests_tenant_status_idx on public.document_requests(barangay_id, status, submitted_at desc);
create index document_requests_resident_idx on public.document_requests(resident_id, submitted_at desc);

create table public.document_request_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  request_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (request_id, barangay_id) references public.document_requests(id, barangay_id) on delete restrict
);

create table public.issued_documents (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  request_id uuid not null unique,
  issuance_number text not null,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  verification_status text not null default 'valid' check (verification_status in ('valid','revoked','corrected')),
  foreign key (request_id, barangay_id) references public.document_requests(id, barangay_id) on delete restrict,
  unique (barangay_id, issuance_number)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  title text not null,
  body text not null,
  audience text not null default 'public' check (audience in ('public','residents','officials')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null)),
  check (length(trim(title)) between 3 and 180),
  check (length(trim(body)) between 3 and 10000)
);
create index announcements_tenant_published_idx on public.announcements(barangay_id, published_at desc)
  where status = 'published';

create table public.announcement_events (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete restrict,
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null check (action in ('created','updated','published','archived')),
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now()
);
create index announcement_events_tenant_idx on public.announcement_events(barangay_id, announcement_id, created_at);

create or replace function public.log_announcement_change()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := case when new.status = 'published' then 'published' else 'created' end;
    insert into public.announcement_events(announcement_id, barangay_id, actor_id, action, to_status)
    values (new.id, new.barangay_id, (select auth.uid()), v_action, new.status);
    return new;
  end if;
  if new.status is distinct from old.status then
    v_action := case new.status when 'published' then 'published' when 'archived' then 'archived' else 'updated' end;
  else
    v_action := 'updated';
  end if;
  insert into public.announcement_events(announcement_id, barangay_id, actor_id, action, from_status, to_status)
  values (new.id, new.barangay_id, (select auth.uid()), v_action, old.status, new.status);
  return new;
end;
$$;

create trigger announcements_audit_insert after insert on public.announcements
  for each row execute function public.log_announcement_change();
create trigger announcements_audit_update after update on public.announcements
  for each row execute function public.log_announcement_change();

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  title text not null,
  description text not null default '',
  location text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  agenda text not null default '',
  status text not null default 'scheduled' check (status in ('draft','scheduled','completed','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, barangay_id),
  check (length(trim(title)) between 2 and 180),
  check (length(trim(location)) between 2 and 180),
  check (length(agenda) <= 5000),
  check (ends_at is null or ends_at > starts_at)
);
create index meetings_tenant_date_idx on public.meetings(barangay_id, starts_at desc);

create table public.meeting_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null,
  barangay_id uuid not null,
  actor_id uuid references public.profiles(id) on delete restrict,
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (meeting_id, barangay_id) references public.meetings(id, barangay_id) on delete restrict
);

create table public.meeting_attendees (
  meeting_id uuid not null,
  barangay_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  added_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id),
  foreign key (meeting_id, barangay_id) references public.meetings(id, barangay_id) on delete restrict
);
create index meeting_attendees_user_idx on public.meeting_attendees(user_id, meeting_id);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null,
  barangay_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null check (status in ('present','absent','excused')),
  source text not null check (source in ('self_checkin','official')),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  reason text,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, user_id),
  foreign key (meeting_id, barangay_id) references public.meetings(id, barangay_id) on delete restrict
);
create index attendance_tenant_meeting_idx on public.attendance_records(barangay_id, meeting_id);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null,
  barangay_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  from_status text,
  to_status text not null check (to_status in ('present','absent','excused')),
  reason text,
  created_at timestamptz not null default now(),
  foreign key (meeting_id, barangay_id) references public.meetings(id, barangay_id) on delete restrict
);

create or replace function public.is_household_member(p_household_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members hm
    join public.residents r on r.id = hm.resident_id and r.barangay_id = hm.barangay_id
    join public.barangay_memberships m on m.barangay_id = r.barangay_id
    where hm.household_id = p_household_id and r.user_id = (select auth.uid())
      and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create or replace function public.is_meeting_attendee(p_meeting_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.meeting_attendees a
    join public.meetings mt on mt.id = a.meeting_id and mt.barangay_id = a.barangay_id
    join public.barangay_memberships bm on bm.barangay_id = a.barangay_id and bm.user_id = a.user_id
    where a.meeting_id = p_meeting_id and a.user_id = (select auth.uid()) and bm.status = 'active');
$$;

create or replace function public.create_barangay_onboarding(
  p_name text, p_municipality text, p_province text, p_code text, p_captain_email text
)
returns table (created_barangay_id uuid, invitation_token text)
language plpgsql security definer
set search_path = ''
as $$
declare v_barangay_id uuid; v_token text; v_role_id uuid;
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120 or length(trim(coalesce(p_municipality, ''))) not between 2 and 120
    or length(trim(coalesce(p_province, ''))) not between 2 and 120 or length(trim(coalesce(p_code, ''))) not between 2 and 40
    or coalesce(p_captain_email, '') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'invalid barangay onboarding details';
  end if;
  insert into public.barangays(name, municipality, province, code)
  values (trim(p_name), trim(p_municipality), trim(p_province), upper(trim(p_code)))
  returning id into v_barangay_id;
  select id into strict v_role_id from public.role_definitions where key = 'captain' and scope = 'barangay';
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations(barangay_id, invited_email, role_id, token_hash, invited_by, expires_at)
  values (v_barangay_id, trim(p_captain_email), v_role_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days');
  insert into public.document_types(barangay_id, code, name, description) values
    (v_barangay_id, 'BARANGAY_CERTIFICATE', 'Barangay Certificate', 'Certificate of residency or community standing'),
    (v_barangay_id, 'BARANGAY_CLEARANCE', 'Barangay Clearance', 'Barangay clearance application'),
    (v_barangay_id, 'INDIGENCY_CERTIFICATE', 'Certificate of Indigency', 'Certificate of indigency application');
  return query select v_barangay_id, v_token;
end;
$$;

create or replace function public.create_membership_invitation(
  p_barangay_id uuid, p_email text, p_role_key text
)
returns table (invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
declare v_invitation_id uuid; v_token text; v_role_id uuid; v_expiry timestamptz;
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.invite') then raise exception 'not authorized'; end if;
  if coalesce(p_email, '') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'invalid email'; end if;
  select id into strict v_role_id from public.role_definitions
    where key = p_role_key and scope = 'barangay' and key not in ('super_admin','captain');
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expiry := now() + interval '7 days';
  insert into public.invitations(barangay_id, invited_email, role_id, token_hash, invited_by, expires_at)
  values (p_barangay_id, trim(p_email), v_role_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_expiry)
  returning id into v_invitation_id;
  return query select v_invitation_id, v_token, v_expiry;
end;
$$;

create or replace function public.accept_membership_invitation(p_token text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_inv public.invitations%rowtype; v_user_id uuid; v_email text; v_membership_id uuid;
begin
  v_user_id := auth.uid();
  v_email := auth.jwt() ->> 'email';
  if v_user_id is null or p_token is null or length(p_token) <> 64 then raise exception 'invalid invitation'; end if;
  select * into v_inv from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now()
    or lower(v_inv.invited_email::text) <> lower(coalesce(v_email, '')) then
    raise exception 'invitation is invalid or expired';
  end if;
  insert into public.barangay_memberships(barangay_id, user_id, role_id, status)
  values (v_inv.barangay_id, v_user_id, v_inv.role_id, 'active')
  returning id into v_membership_id;
  update public.invitations set status = 'accepted', accepted_by = v_user_id, accepted_at = now() where id = v_inv.id;
  return v_membership_id;
end;
$$;

create or replace function public.register_resident(
  p_barangay_id uuid, p_first_name text, p_last_name text, p_birth_date date default null,
  p_phone text default null, p_household_id uuid default null, p_user_id uuid default null,
  p_address_line text default null, p_purok text default null
)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_resident_id uuid; v_household_id uuid; v_household_code text; v_user_id uuid;
begin
  if not public.is_active_member(p_barangay_id) then raise exception 'not authorized'; end if;
  if public.has_tenant_permission(p_barangay_id, 'resident.create') then
    v_user_id := p_user_id;
  else
    if p_user_id is not null and p_user_id <> auth.uid() then raise exception 'not authorized'; end if;
    v_user_id := auth.uid();
  end if;
  if v_user_id is distinct from auth.uid() and not public.has_tenant_permission(p_barangay_id, 'resident.create') then
    raise exception 'not authorized';
  end if;
  if v_user_id is not null and v_user_id <> auth.uid() and not exists (
    select 1 from public.barangay_memberships m where m.user_id = v_user_id
      and m.barangay_id = p_barangay_id and m.status = 'active'
  ) then raise exception 'linked user must have active tenant membership'; end if;
  if length(trim(coalesce(p_first_name, ''))) not between 1 and 100 or length(trim(coalesce(p_last_name, ''))) not between 1 and 100
    or p_phone is not null and length(p_phone) > 40
    or p_birth_date is not null and p_birth_date > current_date then raise exception 'invalid resident details'; end if;
  if p_household_id is not null then
    select h.id into v_household_id from public.households h
      where h.id = p_household_id and h.barangay_id = p_barangay_id;
    if v_household_id is null then raise exception 'household not found'; end if;
    if v_user_id = auth.uid() and not public.is_household_member(p_household_id) then
      raise exception 'not authorized to use this household';
    end if;
  else
    if v_user_id is distinct from auth.uid() and not public.has_tenant_permission(p_barangay_id, 'household.manage') then
      raise exception 'household assignment is required';
    end if;
    if length(trim(coalesce(p_address_line, ''))) not between 3 and 250 or length(coalesce(p_purok, '')) > 100 then
      raise exception 'a valid household address is required';
    end if;
    v_household_code := 'H-' || upper(substr(gen_random_uuid()::text, 1, 8));
    insert into public.households(barangay_id, household_code, address_line, purok)
      values (p_barangay_id, v_household_code, trim(p_address_line), nullif(trim(p_purok), ''))
      returning id into v_household_id;
  end if;
  insert into public.residents(barangay_id, user_id, first_name, last_name, birth_date, phone, household_id, created_by)
  values (p_barangay_id, v_user_id, trim(p_first_name), trim(p_last_name), p_birth_date, nullif(trim(p_phone), ''), v_household_id, auth.uid())
  returning id into v_resident_id;
  insert into public.household_members(barangay_id, household_id, resident_id, is_head)
  values (p_barangay_id, v_household_id, v_resident_id, true);
  insert into public.residency_verifications(barangay_id, resident_id)
  values (p_barangay_id, v_resident_id);
  return v_resident_id;
end;
$$;

create or replace function public.verify_residency(p_resident_id uuid, p_status text, p_reason text default null)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_barangay_id uuid; v_verification_id uuid;
begin
  select barangay_id into v_barangay_id from public.residents where id = p_resident_id;
  if v_barangay_id is null or not public.has_tenant_permission(v_barangay_id, 'resident.verify') then
    raise exception 'not authorized';
  end if;
  if p_status not in ('verified','rejected') then raise exception 'invalid verification status'; end if;
  if p_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  insert into public.residency_verifications(barangay_id, resident_id, status, verified_by, verified_at, reason)
  values (v_barangay_id, p_resident_id, p_status, auth.uid(), now(), nullif(trim(p_reason), ''))
  returning id into v_verification_id;
  return v_verification_id;
end;
$$;

create or replace function public.create_document_request(
  p_barangay_id uuid, p_resident_id uuid, p_document_type_id uuid, p_purpose text
)
returns table (request_id uuid, reference_number text)
language plpgsql security definer
set search_path = ''
as $$
declare v_user_id uuid; v_reference text; v_request_id uuid;
begin
  select r.user_id into v_user_id from public.residents r
    where r.id = p_resident_id and r.barangay_id = p_barangay_id and r.record_status = 'active';
  if not exists (select 1 from public.residents r where r.id = p_resident_id
    and r.barangay_id = p_barangay_id and r.record_status = 'active') then raise exception 'resident record not found'; end if;
  if v_user_id is distinct from auth.uid() and not public.has_tenant_permission(p_barangay_id, 'document.request.create') then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.document_types d where d.id = p_document_type_id
    and d.barangay_id = p_barangay_id and d.public_request_enabled) then raise exception 'document type is unavailable'; end if;
  if length(trim(p_purpose)) not between 3 and 500 then raise exception 'invalid request purpose'; end if;
  v_reference := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.document_requests(barangay_id, reference_number, resident_id, document_type_id, purpose)
  values (p_barangay_id, v_reference, p_resident_id, p_document_type_id, trim(p_purpose))
  returning id into v_request_id;
  insert into public.document_request_events(barangay_id, request_id, actor_id, to_status, reason)
  values (p_barangay_id, v_request_id, auth.uid(), 'pending', 'Request submitted');
  return query select v_request_id, v_reference;
end;
$$;

create or replace function public.transition_document_request(
  p_request_id uuid, p_next_status text, p_reason text default null
)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_req public.document_requests%rowtype; v_allowed boolean := false; v_number text;
begin
  select * into v_req from public.document_requests where id = p_request_id for update;
  if not found then raise exception 'request not found'; end if;
  if p_next_status = 'cancelled' and v_req.status = 'pending' and exists (
    select 1 from public.residents r where r.id = v_req.resident_id and r.user_id = auth.uid()
  ) then
    v_allowed := true;
  else
    if p_next_status in ('issued','released') then
      if not public.has_tenant_permission(v_req.barangay_id, 'document.issue') then raise exception 'not authorized'; end if;
    elsif not public.has_tenant_permission(v_req.barangay_id, 'document.request.review') then
      raise exception 'not authorized';
    end if;
    v_allowed := (v_req.status = 'pending' and p_next_status in ('under_review','rejected'))
      or (v_req.status = 'under_review' and p_next_status in ('awaiting_approval','approved','rejected'))
      or (v_req.status = 'awaiting_approval' and p_next_status in ('approved','rejected'))
      or (v_req.status = 'approved' and p_next_status = 'issued')
      or (v_req.status = 'issued' and p_next_status = 'released');
  end if;
  if not v_allowed then raise exception 'invalid request transition'; end if;
  if p_next_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a rejection reason is required';
  end if;
  update public.document_requests set status = p_next_status,
    reviewed_by = case when p_next_status in ('under_review','awaiting_approval','approved','rejected') then auth.uid() else reviewed_by end,
    reviewed_at = case when p_next_status in ('under_review','awaiting_approval','approved','rejected') then now() else reviewed_at end,
    rejection_reason = case when p_next_status = 'rejected' then trim(p_reason) else null end
  where id = p_request_id;
  if p_next_status = 'issued' then
    v_number := to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.issued_documents(barangay_id, request_id, issuance_number, issued_by)
    values (v_req.barangay_id, v_req.id, v_number, auth.uid());
  end if;
  insert into public.document_request_events(barangay_id, request_id, actor_id, from_status, to_status, reason)
  values (v_req.barangay_id, v_req.id, auth.uid(), v_req.status, p_next_status, nullif(trim(p_reason), ''));
end;
$$;

create or replace function public.create_meeting(
  p_barangay_id uuid, p_title text, p_location text, p_starts_at timestamptz,
  p_ends_at timestamptz default null, p_agenda text default '', p_attendee_ids uuid[] default '{}'
)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_meeting_id uuid; v_attendee_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id, 'meeting.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_title, ''))) not between 2 and 180 or length(trim(coalesce(p_location, ''))) not between 2 and 180
    or length(coalesce(p_agenda, '')) > 5000
    or p_starts_at is null or p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'invalid meeting details';
  end if;
  if cardinality(coalesce(p_attendee_ids, '{}')) > 100 then raise exception 'too many attendees'; end if;
  if exists (select 1 from unnest(coalesce(p_attendee_ids, '{}')) as attendee(user_id)
    where not exists (select 1 from public.barangay_memberships m
      where m.user_id = attendee.user_id and m.barangay_id = p_barangay_id and m.status = 'active')) then
    raise exception 'all attendees must have active tenant membership';
  end if;
  insert into public.meetings(barangay_id, title, location, starts_at, ends_at, agenda, created_by)
  values (p_barangay_id, trim(p_title), trim(p_location), p_starts_at, p_ends_at, coalesce(p_agenda, ''), auth.uid())
  returning id into v_meeting_id;
  foreach v_attendee_id in array array_append(coalesce(p_attendee_ids, '{}'), auth.uid()) loop
    insert into public.meeting_attendees(meeting_id, barangay_id, user_id, added_by)
    values (v_meeting_id, p_barangay_id, v_attendee_id, auth.uid()) on conflict do nothing;
  end loop;
  return v_meeting_id;
end;
$$;

create or replace function public.update_meeting_status(p_meeting_id uuid, p_next_status text, p_reason text default null)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_meeting public.meetings%rowtype;
begin
  select * into v_meeting from public.meetings where id = p_meeting_id for update;
  if not found or not public.has_tenant_permission(v_meeting.barangay_id, 'meeting.manage') then
    raise exception 'not authorized';
  end if;
  if v_meeting.status <> 'scheduled' or p_next_status not in ('completed','cancelled') then
    raise exception 'invalid meeting transition';
  end if;
  if p_next_status = 'cancelled' and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a cancellation reason is required';
  end if;
  update public.meetings set status = p_next_status where id = p_meeting_id;
  insert into public.meeting_events(meeting_id, barangay_id, actor_id, from_status, to_status, reason)
  values (p_meeting_id, v_meeting.barangay_id, auth.uid(), v_meeting.status, p_next_status, nullif(trim(p_reason), ''));
end;
$$;

create or replace function public.mark_meeting_attendance(
  p_meeting_id uuid, p_user_id uuid default null, p_status text default 'present', p_reason text default null
)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_meeting public.meetings%rowtype; v_attendee uuid; v_source text; v_previous_status text;
begin
  select * into v_meeting from public.meetings where id = p_meeting_id;
  if not found then raise exception 'meeting not found'; end if;
  v_attendee := coalesce(p_user_id, auth.uid());
  if p_status not in ('present','absent','excused') then raise exception 'invalid attendance status'; end if;
  if v_attendee = auth.uid() and p_status = 'present' and p_user_id is null then
    if v_meeting.status <> 'scheduled' or now() < v_meeting.starts_at - interval '30 minutes'
      or now() > coalesce(v_meeting.ends_at, v_meeting.starts_at + interval '4 hours') + interval '30 minutes' then
      raise exception 'attendance window is closed';
    end if;
    v_source := 'self_checkin';
  elsif public.has_tenant_permission(v_meeting.barangay_id, 'attendance.manage') then
    v_source := 'official';
    if p_status <> 'present' and length(trim(coalesce(p_reason, ''))) < 3 then
      raise exception 'a reason is required for absence or excuse';
    end if;
  else
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.meeting_attendees a
    join public.barangay_memberships bm on bm.user_id = a.user_id and bm.barangay_id = a.barangay_id
    where a.meeting_id = p_meeting_id and a.user_id = v_attendee and bm.status = 'active') then
    raise exception 'user is not an eligible attendee';
  end if;
  select a.status into v_previous_status from public.attendance_records a
    where a.meeting_id = p_meeting_id and a.user_id = v_attendee for update;
  if v_previous_status is not null and v_source <> 'official' then raise exception 'attendance is already recorded'; end if;
  if v_previous_status is not null and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a correction reason is required';
  end if;
  insert into public.attendance_records(meeting_id, barangay_id, user_id, status, source, recorded_by, reason)
  values (p_meeting_id, v_meeting.barangay_id, v_attendee, p_status, v_source, auth.uid(), nullif(trim(p_reason), ''))
  on conflict (meeting_id, user_id) do update set status = excluded.status, source = 'official',
    recorded_by = excluded.recorded_by, reason = excluded.reason, updated_at = now()
    where public.has_tenant_permission(v_meeting.barangay_id, 'attendance.manage');
  if not found then raise exception 'attendance is already recorded'; end if;
  insert into public.attendance_events(meeting_id, barangay_id, user_id, actor_id, from_status, to_status, reason)
  values (p_meeting_id, v_meeting.barangay_id, v_attendee, auth.uid(), v_previous_status, p_status,
    case when v_previous_status is not null then nullif(trim(p_reason), '') else nullif(trim(p_reason), '') end);
end;
$$;

alter table public.invitations enable row level security;
alter table public.households enable row level security;
alter table public.residents enable row level security;
alter table public.residency_verifications enable row level security;
alter table public.household_members enable row level security;
alter table public.document_types enable row level security;
alter table public.document_requests enable row level security;
alter table public.document_request_events enable row level security;
alter table public.issued_documents enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_events enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_events enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_events enable row level security;

create policy invitations_read_manager on public.invitations for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'membership.read'));
create policy households_read on public.households for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'resident.read') or public.is_household_member(id));
create policy households_create on public.households for insert to authenticated
  with check (public.has_tenant_permission(barangay_id, 'household.manage'));
create policy households_update on public.households for update to authenticated
  using (public.has_tenant_permission(barangay_id, 'household.manage'))
  with check (public.has_tenant_permission(barangay_id, 'household.manage'));
create policy residents_read on public.residents for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'resident.read') or user_id = (select auth.uid()));
create policy residents_update_staff on public.residents for update to authenticated
  using (public.has_tenant_permission(barangay_id, 'resident.update'))
  with check (public.has_tenant_permission(barangay_id, 'resident.update'));
create policy verification_read_staff on public.residency_verifications for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'resident.read')
    or exists (select 1 from public.residents r where r.id = resident_id and r.user_id = (select auth.uid())));
create policy household_members_read on public.household_members for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'resident.read') or public.is_household_member(household_id));

create policy document_types_read on public.document_types for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'document.request.review')
    or (public.is_active_member(barangay_id) and public_request_enabled));
create policy document_requests_read on public.document_requests for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'document.request.read')
    or exists (select 1 from public.residents r where r.id = resident_id and r.user_id = (select auth.uid())));
create policy document_request_events_read on public.document_request_events for select to authenticated
  using (exists (select 1 from public.document_requests d where d.id = request_id
    and (public.has_tenant_permission(d.barangay_id, 'document.request.read')
      or exists (select 1 from public.residents r where r.id = d.resident_id and r.user_id = (select auth.uid())))));
create policy issued_documents_read on public.issued_documents for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'document.request.read')
    or exists (select 1 from public.document_requests d join public.residents r on r.id = d.resident_id
      where d.id = request_id and r.user_id = (select auth.uid())));

create policy announcements_read on public.announcements for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'announcement.publish')
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience = 'officials' and public.has_tenant_permission(barangay_id, 'announcement.read'))
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience in ('public','residents') and public.is_active_member(barangay_id)));
create policy announcements_create on public.announcements for insert to authenticated
  with check (public.has_tenant_permission(barangay_id, 'announcement.publish') and created_by = (select auth.uid()));
create policy announcements_update on public.announcements for update to authenticated
  using (public.has_tenant_permission(barangay_id, 'announcement.publish'))
  with check (public.has_tenant_permission(barangay_id, 'announcement.publish'));
create policy announcement_events_read on public.announcement_events for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'announcement.publish'));

create policy meetings_read on public.meetings for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'meeting.read') or public.is_meeting_attendee(id));
create policy meetings_create on public.meetings for insert to authenticated
  with check (public.has_tenant_permission(barangay_id, 'meeting.manage') and created_by = (select auth.uid()));
create policy meetings_update on public.meetings for update to authenticated
  using (public.has_tenant_permission(barangay_id, 'meeting.manage'))
  with check (public.has_tenant_permission(barangay_id, 'meeting.manage'));
create policy meeting_attendees_read on public.meeting_attendees for select to authenticated
  using (user_id = (select auth.uid()) or public.has_tenant_permission(barangay_id, 'meeting.manage'));
create policy meeting_events_read on public.meeting_events for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'meeting.manage'));
create policy meeting_attendees_manage on public.meeting_attendees for insert to authenticated
  with check (public.has_tenant_permission(barangay_id, 'meeting.manage')
    and added_by = (select auth.uid())
    and exists (select 1 from public.barangay_memberships m where m.user_id = meeting_attendees.user_id
      and m.barangay_id = meeting_attendees.barangay_id and m.status = 'active'));
create policy attendance_read on public.attendance_records for select to authenticated
  using (user_id = (select auth.uid()) or public.has_tenant_permission(barangay_id, 'attendance.read'));
create policy attendance_events_read on public.attendance_events for select to authenticated
  using (user_id = (select auth.uid()) or public.has_tenant_permission(barangay_id, 'attendance.read'));

revoke all on public.invitations, public.households, public.residents, public.residency_verifications,
  public.household_members, public.document_types, public.document_requests, public.document_request_events,
  public.issued_documents, public.announcements, public.meetings, public.meeting_events, public.meeting_attendees, public.attendance_records,
  public.attendance_events, public.announcement_events
  from anon, authenticated;

grant select on public.invitations, public.households, public.residents, public.residency_verifications,
  public.household_members, public.document_types, public.document_requests, public.document_request_events,
  public.issued_documents, public.announcements, public.meetings, public.meeting_events, public.meeting_attendees, public.attendance_records,
  public.attendance_events, public.announcement_events
  to authenticated;
grant insert (barangay_id, title, body, audience, status, created_by, published_at, expires_at) on public.announcements to authenticated;
grant update (title, body, audience, status, published_at, expires_at) on public.announcements to authenticated;
grant update (title, description, location, starts_at, ends_at, agenda) on public.meetings to authenticated;
grant insert, update (address_line, purok) on public.households to authenticated;
grant update (first_name, middle_name, last_name, suffix, birth_date, phone, record_status)
  on public.residents to authenticated;

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.log_announcement_change() from public, anon, authenticated;
revoke all on function public.is_meeting_attendee(uuid) from public, anon;
revoke all on function public.create_barangay_onboarding(text,text,text,text,text) from public, anon;
revoke all on function public.create_membership_invitation(uuid,text,text) from public, anon;
revoke all on function public.accept_membership_invitation(text) from public, anon;
revoke all on function public.register_resident(uuid,text,text,date,text,uuid,uuid,text,text) from public, anon;
revoke all on function public.verify_residency(uuid,text,text) from public, anon;
revoke all on function public.create_document_request(uuid,uuid,uuid,text) from public, anon;
revoke all on function public.transition_document_request(uuid,text,text) from public, anon;
revoke all on function public.create_meeting(uuid,text,text,timestamptz,timestamptz,text,uuid[]) from public, anon;
revoke all on function public.update_meeting_status(uuid,text,text) from public, anon;
revoke all on function public.mark_meeting_attendance(uuid,uuid,text,text) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_meeting_attendee(uuid) to authenticated;
grant execute on function public.create_barangay_onboarding(text,text,text,text,text) to authenticated;
grant execute on function public.create_membership_invitation(uuid,text,text) to authenticated;
grant execute on function public.accept_membership_invitation(text) to authenticated;
grant execute on function public.register_resident(uuid,text,text,date,text,uuid,uuid,text,text) to authenticated;
grant execute on function public.verify_residency(uuid,text,text) to authenticated;
grant execute on function public.create_document_request(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.transition_document_request(uuid,text,text) to authenticated;
grant execute on function public.create_meeting(uuid,text,text,timestamptz,timestamptz,text,uuid[]) to authenticated;
grant execute on function public.update_meeting_status(uuid,text,text) to authenticated;
grant execute on function public.mark_meeting_attendance(uuid,uuid,text,text) to authenticated;

