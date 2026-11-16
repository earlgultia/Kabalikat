-- Municipality-level ownership: the platform provisions an LGU administrator,
-- LGUs create their barangay workspaces, and Captains explicitly escalate
-- active Tanod reports when municipal support is needed.

create table public.local_government_units (
  id uuid primary key default gen_random_uuid(),
  municipality text not null check (length(trim(municipality)) between 2 and 120),
  province text not null check (length(trim(province)) between 2 and 120),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  unique (id, municipality, province)
);
create unique index local_government_units_location_unique
  on public.local_government_units (lower(trim(municipality)), lower(trim(province)));

create table public.lgu_memberships (
  id uuid primary key default gen_random_uuid(),
  lgu_id uuid not null references public.local_government_units(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active','suspended','revoked')),
  created_at timestamptz not null default now(),
  unique (lgu_id, user_id)
);
create index lgu_memberships_user_status_idx on public.lgu_memberships(user_id, status);
create index lgu_memberships_lgu_status_idx on public.lgu_memberships(lgu_id, status);
create unique index lgu_memberships_one_active_admin_per_lgu_idx on public.lgu_memberships(lgu_id) where status = 'active';
create unique index lgu_memberships_one_active_lgu_per_user_idx on public.lgu_memberships(user_id) where status = 'active';

create table public.lgu_invitations (
  id uuid primary key default gen_random_uuid(),
  lgu_id uuid not null references public.local_government_units(id) on delete restrict,
  invited_email extensions.citext not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'accepted') = (accepted_at is not null))
);
create index lgu_invitations_lgu_status_idx on public.lgu_invitations(lgu_id,status,expires_at);

alter table public.barangays
  add column lgu_id uuid references public.local_government_units(id) on delete restrict;
create index barangays_lgu_status_idx on public.barangays(lgu_id,status) where lgu_id is not null;

alter table public.local_government_units enable row level security;
alter table public.lgu_memberships enable row level security;
alter table public.lgu_invitations enable row level security;
revoke all on public.local_government_units, public.lgu_memberships, public.lgu_invitations from public, anon, authenticated;

create policy local_government_units_member_read on public.local_government_units
  for select to authenticated using (exists (
    select 1 from public.lgu_memberships membership
    where membership.lgu_id = id and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  ));
create policy lgu_memberships_self_read on public.lgu_memberships
  for select to authenticated using (user_id = (select auth.uid()) and status = 'active');
grant select on public.local_government_units, public.lgu_memberships to authenticated;

create or replace function public.create_lgu_administrator_invitation(
  p_municipality text, p_province text, p_email text
) returns table (lgu_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_lgu_id uuid; v_token text; v_expiry timestamptz := now() + interval '7 days';
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_municipality,''))) not between 2 and 120
    or length(trim(coalesce(p_province,''))) not between 2 and 120
    or coalesce(p_email,'') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'enter a valid municipality, province, and LGU administrator email';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    lower(trim(p_municipality)) || '|' || lower(trim(p_province)), 36601
  ));

  insert into public.local_government_units(municipality,province)
  values (trim(p_municipality),trim(p_province))
  on conflict (lower(trim(municipality)),lower(trim(province))) do update
    set status = 'active'
  returning id into v_lgu_id;

  -- Attach legacy workspaces only when both municipality and province match
  -- exactly after case and whitespace normalization.
  update public.barangays barangay set lgu_id = v_lgu_id
  where barangay.lgu_id is null
    and lower(trim(barangay.municipality)) = lower(trim(p_municipality))
    and lower(trim(barangay.province)) = lower(trim(p_province));

  if exists (select 1 from public.lgu_memberships membership
    where membership.lgu_id = v_lgu_id and membership.status = 'active') then
    raise exception 'this municipality already has an active LGU administrator';
  end if;

  update public.lgu_invitations set status = 'revoked'
  where lgu_invitations.lgu_id = v_lgu_id and lgu_invitations.status = 'pending';
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.lgu_invitations(lgu_id,invited_email,token_hash,invited_by,expires_at)
  values (v_lgu_id,lower(trim(p_email)),encode(extensions.digest(v_token,'sha256'),'hex'),auth.uid(),v_expiry);
  return query select v_lgu_id,v_token,v_expiry;
end;
$$;

create or replace function public.list_platform_lgu_directory()
returns table (
  lgu_id uuid,municipality text,province text,status text,administrator_active boolean,
  barangay_count bigint,pending_invited_email text,pending_invitation_expires_at timestamptz,created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  return query select lgu.id,lgu.municipality,lgu.province,lgu.status,
    exists (select 1 from public.lgu_memberships membership where membership.lgu_id = lgu.id and membership.status = 'active'),
    (select count(*) from public.barangays barangay where barangay.lgu_id = lgu.id),
    pending.invited_email,pending.expires_at,lgu.created_at
  from public.local_government_units lgu
  left join lateral (
    select invitation.invited_email::text as invited_email,invitation.expires_at
    from public.lgu_invitations invitation
    where invitation.lgu_id = lgu.id and invitation.status = 'pending' and invitation.expires_at > now()
    order by invitation.created_at desc limit 1
  ) pending on true
  order by lgu.municipality,lgu.province,lgu.id;
end;
$$;

create or replace function public.get_public_invitation_kind(p_token text)
returns table (invitation_kind text, target_label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null or length(p_token) <> 64 then return; end if;
  if exists (select 1 from public.lgu_invitations invitation
    where invitation.token_hash = encode(extensions.digest(p_token,'sha256'),'hex')
      and invitation.status = 'pending' and invitation.expires_at > now()) then
    return query select 'lgu'::text, (select lgu.municipality || ', ' || lgu.province
      from public.lgu_invitations invitation join public.local_government_units lgu on lgu.id = invitation.lgu_id
      where invitation.token_hash = encode(extensions.digest(p_token,'sha256'),'hex'));
    return;
  end if;
  if exists (select 1 from public.invitations invitation
    where invitation.token_hash = encode(extensions.digest(p_token,'sha256'),'hex')
      and invitation.status = 'pending' and invitation.expires_at > now()) then
    return query select 'barangay'::text, (select barangay.name || ', ' || barangay.municipality
      from public.invitations invitation join public.barangays barangay on barangay.id = invitation.barangay_id
      where invitation.token_hash = encode(extensions.digest(p_token,'sha256'),'hex'));
  end if;
end;
$$;

create or replace function public.accept_lgu_administrator_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_invitation public.lgu_invitations%rowtype; v_membership_id uuid; v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or p_token is null or length(p_token) <> 64 then raise exception 'invalid invitation'; end if;
  select * into v_invitation from public.lgu_invitations invitation
  where invitation.token_hash = encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or lower(v_invitation.invited_email::text) <> lower(coalesce(auth.jwt() ->> 'email','')) then
    raise exception 'invitation is invalid or expired, or its email does not match your signed-in account';
  end if;
  if not exists (select 1 from public.local_government_units lgu where lgu.id = v_invitation.lgu_id and lgu.status = 'active') then
    raise exception 'this LGU workspace is not active';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_invitation.lgu_id::text,36602));
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,36603));
  if exists (select 1 from public.lgu_memberships membership
    where membership.lgu_id = v_invitation.lgu_id and membership.status = 'active' and membership.user_id <> v_user_id) then
    raise exception 'this municipality already has an active LGU administrator';
  end if;
  if exists (select 1 from public.lgu_memberships membership
    where membership.user_id = v_user_id and membership.status = 'active' and membership.lgu_id <> v_invitation.lgu_id) then
    raise exception 'this account already belongs to another municipal LGU workspace';
  end if;
  insert into public.lgu_memberships(lgu_id,user_id,status)
  values (v_invitation.lgu_id,v_user_id,'active')
  on conflict (lgu_id,user_id) do update set status = 'active'
  returning id into v_membership_id;
  update public.lgu_invitations set status = 'accepted',accepted_by = v_user_id,accepted_at = now() where id = v_invitation.id;
  return v_membership_id;
end;
$$;

create or replace function public.create_lgu_barangay_with_captain(
  p_name text, p_code text, p_captain_email text
) returns table (created_barangay_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_lgu public.local_government_units%rowtype; v_barangay_id uuid; v_role_id uuid; v_token text; v_expiry timestamptz := now() + interval '7 days';
begin
  select lgu.* into v_lgu from public.local_government_units lgu
  join public.lgu_memberships membership on membership.lgu_id = lgu.id
  where membership.user_id = (select auth.uid()) and membership.status = 'active' and lgu.status = 'active'
  order by membership.created_at limit 1;
  if not found then raise exception 'active LGU administrator access is required'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120
    or length(trim(coalesce(p_code,''))) not between 2 and 40
    or coalesce(p_captain_email,'') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'enter a valid barangay name, code, and Captain email';
  end if;
  insert into public.barangays(name,municipality,province,code,lgu_id)
  values (trim(p_name),v_lgu.municipality,v_lgu.province,upper(trim(p_code)),v_lgu.id)
  returning id into v_barangay_id;
  select role.id into strict v_role_id from public.role_definitions role where role.key = 'captain' and role.scope = 'barangay';
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.invitations(barangay_id,invited_email,role_id,token_hash,invited_by,expires_at)
  values (v_barangay_id,lower(trim(p_captain_email)),v_role_id,encode(extensions.digest(v_token,'sha256'),'hex'),auth.uid(),v_expiry);
  insert into public.document_types(barangay_id,code,name,description) values
    (v_barangay_id,'BARANGAY_CERTIFICATE','Barangay Certificate','Certificate of residency or community standing'),
    (v_barangay_id,'BARANGAY_CLEARANCE','Barangay Clearance','Barangay clearance application'),
    (v_barangay_id,'INDIGENCY_CERTIFICATE','Certificate of Indigency','Certificate of indigency application');
  return query select v_barangay_id,v_token,v_expiry;
end;
$$;

create or replace function public.create_lgu_captain_invitation(p_barangay_id uuid,p_captain_email text)
returns table (invitation_token text,expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_lgu_id uuid; v_role_id uuid; v_token text; v_expiry timestamptz := now() + interval '7 days';
begin
  select barangay.lgu_id into v_lgu_id from public.barangays barangay
  join public.local_government_units lgu on lgu.id = barangay.lgu_id and lgu.status = 'active'
  join public.lgu_memberships access on access.lgu_id = lgu.id and access.user_id = (select auth.uid()) and access.status = 'active'
  where barangay.id = p_barangay_id and barangay.status = 'active';
  if v_lgu_id is null then raise exception 'this barangay is not active in your LGU workspace'; end if;
  if coalesce(p_captain_email,'') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'enter a valid Captain email'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_barangay_id::text,0));
  select role.id into strict v_role_id from public.role_definitions role where role.key = 'captain' and role.scope = 'barangay';
  if exists (select 1 from public.barangay_memberships membership where membership.barangay_id = p_barangay_id
    and membership.role_id = v_role_id and membership.status = 'active') then
    raise exception 'this barangay already has an active Captain';
  end if;
  update public.invitations invitation set status = 'revoked'
  where invitation.barangay_id = p_barangay_id and invitation.role_id = v_role_id and invitation.status = 'pending';
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.invitations(barangay_id,invited_email,role_id,token_hash,invited_by,expires_at)
  values (p_barangay_id,lower(trim(p_captain_email)),v_role_id,encode(extensions.digest(v_token,'sha256'),'hex'),auth.uid(),v_expiry);
  return query select v_token,v_expiry;
end;
$$;

create or replace function public.list_lgu_barangays()
returns table (id uuid,name text,municipality text,province text,code text,status text,active_members bigint,captain_active boolean,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query select barangay.id,barangay.name,barangay.municipality,barangay.province,barangay.code,barangay.status,
    count(membership.id) filter (where membership.status = 'active'),
    exists (select 1 from public.barangay_memberships captain join public.role_definitions role on role.id = captain.role_id
      where captain.barangay_id = barangay.id and captain.status = 'active' and role.key = 'captain'),
    barangay.created_at
  from public.barangays barangay
  join public.lgu_memberships access on access.lgu_id = barangay.lgu_id and access.user_id = (select auth.uid()) and access.status = 'active'
  join public.local_government_units lgu on lgu.id = access.lgu_id and lgu.status = 'active'
  left join public.barangay_memberships membership on membership.barangay_id = barangay.id
  where barangay.lgu_id = access.lgu_id
  group by barangay.id order by barangay.name;
end;
$$;

create table public.lgu_incident_escalations (
  id uuid primary key default gen_random_uuid(),
  lgu_id uuid not null references public.local_government_units(id) on delete restrict,
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  incident_id uuid not null unique,
  escalated_by uuid not null references public.profiles(id) on delete restrict,
  escalation_note text not null check (length(trim(escalation_note)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending','acknowledged','resolved')),
  lgu_response_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (incident_id,barangay_id) references public.incidents(id,barangay_id) on delete restrict,
  check (lgu_response_note is null or length(trim(lgu_response_note)) between 3 and 1000)
);
create index lgu_incident_escalations_queue_idx on public.lgu_incident_escalations(lgu_id,status,created_at desc);
alter table public.lgu_incident_escalations enable row level security;
revoke all on public.lgu_incident_escalations from public,anon,authenticated;

alter table public.incident_events drop constraint if exists incident_events_action_check;
alter table public.incident_events add constraint incident_events_action_check
  check (action in ('submitted','assigned','acknowledged','started','resolved','closed','response_update','evidence_attached','escalated'));

create table public.lgu_incident_escalation_events (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references public.lgu_incident_escalations(id) on delete restrict,
  lgu_id uuid not null references public.local_government_units(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('escalated','acknowledged','resolved')),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (length(note) <= 1000)
);
create index lgu_incident_escalation_events_history_idx on public.lgu_incident_escalation_events(escalation_id,created_at,id);
alter table public.lgu_incident_escalation_events enable row level security;
revoke all on public.lgu_incident_escalation_events from public,anon,authenticated;

create or replace function public.escalate_incident_to_lgu(p_incident_id uuid,p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_lgu_id uuid; v_escalation_id uuid;
begin
  select incident.* into v_incident from public.incidents incident where incident.id = p_incident_id for update;
  if not found or not public.has_tenant_permission(v_incident.barangay_id,'incident.manage')
    or not exists (select 1 from public.barangay_memberships membership join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = v_incident.barangay_id and membership.user_id = (select auth.uid())
        and membership.status = 'active' and role.key = 'captain') then
    raise exception 'only the active Barangay Captain may escalate this report';
  end if;
  if v_incident.status not in ('submitted','acknowledged','in_progress') then raise exception 'only active incident reports can be escalated'; end if;
  if length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'explain why municipal support is needed'; end if;
  select barangay.lgu_id into v_lgu_id from public.barangays barangay
  join public.local_government_units lgu on lgu.id = barangay.lgu_id and lgu.status = 'active'
  where barangay.id = v_incident.barangay_id;
  if v_lgu_id is null then raise exception 'this barangay is not linked to an active LGU'; end if;
  insert into public.lgu_incident_escalations(lgu_id,barangay_id,incident_id,escalated_by,escalation_note)
  values (v_lgu_id,v_incident.barangay_id,v_incident.id,(select auth.uid()),trim(p_note))
  returning id into v_escalation_id;
  insert into public.lgu_incident_escalation_events(escalation_id,lgu_id,actor_id,action,note)
  values (v_escalation_id,v_lgu_id,(select auth.uid()),'escalated',trim(p_note));
  insert into public.incident_events(incident_id,barangay_id,actor_id,action,note)
  values (v_incident.id,v_incident.barangay_id,(select auth.uid()),'escalated','Escalated to the municipal LGU for support.');
  return v_escalation_id;
end;
$$;

create or replace function public.list_lgu_escalated_incident_ids(p_barangay_id uuid,p_incident_ids uuid[])
returns table (incident_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_barangay_id,'incident.manage')
    or not exists (select 1 from public.barangay_memberships membership join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id and membership.user_id = (select auth.uid())
        and membership.status = 'active' and role.key = 'captain') then
    raise exception 'only the active Barangay Captain may check escalation status';
  end if;
  return query select escalation.incident_id from public.lgu_incident_escalations escalation
  where escalation.barangay_id = p_barangay_id and escalation.incident_id = any(coalesce(p_incident_ids,'{}'::uuid[]));
end;
$$;

create or replace function public.list_captain_lgu_incident_updates(p_barangay_id uuid,p_incident_ids uuid[])
returns table (incident_id uuid,status text,response_note text,updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'incident.manage')
    or not exists (select 1 from public.barangay_memberships membership join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id and membership.user_id = (select auth.uid())
        and membership.status = 'active' and role.key = 'captain') then
    raise exception 'only the active Barangay Captain may check LGU incident updates';
  end if;
  select barangay.lgu_id into v_lgu_id from public.barangays barangay
  where barangay.id = p_barangay_id;
  if v_lgu_id is null then return; end if;
  return query select escalation.incident_id,escalation.status,escalation.lgu_response_note,escalation.updated_at
  from public.lgu_incident_escalations escalation
  where escalation.lgu_id = v_lgu_id and escalation.barangay_id = p_barangay_id
    and escalation.incident_id = any(coalesce(p_incident_ids,'{}'::uuid[]));
end;
$$;

create or replace function public.list_captain_lgu_incident_history(p_barangay_id uuid,p_incident_id uuid)
returns table (id uuid,action text,note text,actor_name text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'incident.manage')
    or not exists (select 1 from public.barangay_memberships membership join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id and membership.user_id = (select auth.uid())
        and membership.status = 'active' and role.key = 'captain') then
    raise exception 'only the active Barangay Captain may review LGU response history';
  end if;
  select barangay.lgu_id into v_lgu_id from public.barangays barangay
  where barangay.id = p_barangay_id;
  if v_lgu_id is null or not exists (
    select 1 from public.lgu_incident_escalations escalation
    where escalation.incident_id = p_incident_id and escalation.barangay_id = p_barangay_id and escalation.lgu_id = v_lgu_id
  ) then
    raise exception 'LGU escalation history not found or not permitted';
  end if;
  return query select event.id,event.action,event.note,
    coalesce(nullif(profile.display_name,''),'Authorized administrator'),event.created_at
  from public.lgu_incident_escalation_events event
  join public.lgu_incident_escalations escalation on escalation.id = event.escalation_id
  left join public.profiles profile on profile.id = event.actor_id
  where escalation.incident_id = p_incident_id and escalation.barangay_id = p_barangay_id
    and event.lgu_id = v_lgu_id
  order by event.created_at,event.id;
end;
$$;

create or replace function public.list_lgu_incident_escalations(p_status text default 'all')
returns table (id uuid,incident_id uuid,barangay_id uuid,barangay_name text,category text,severity text,location text,summary text,details text,incident_status text,escalation_note text,status text,lgu_response_note text,created_at timestamptz,updated_at timestamptz,total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active' order by membership.created_at limit 1;
  if v_lgu_id is null then raise exception 'active LGU administrator access is required'; end if;
  if p_status not in ('all','pending','acknowledged','resolved') then raise exception 'invalid escalation filter'; end if;
  return query select escalation.id,incident.id,barangay.id,barangay.name,incident.category,incident.severity,
    incident.location,incident.summary,incident.details,incident.status,escalation.escalation_note,escalation.status,
    escalation.lgu_response_note,escalation.created_at,escalation.updated_at,
    count(*) over ()
  from public.lgu_incident_escalations escalation
  join public.incidents incident on incident.id = escalation.incident_id and incident.barangay_id = escalation.barangay_id
  join public.barangays barangay on barangay.id = escalation.barangay_id and barangay.lgu_id = v_lgu_id
  where escalation.lgu_id = v_lgu_id and (p_status = 'all' or escalation.status = p_status)
  order by case escalation.status when 'pending' then 0 when 'acknowledged' then 1 else 2 end, escalation.created_at desc, escalation.id
  limit 500;
end;
$$;

create or replace function public.list_lgu_incident_escalation_history(p_escalation_id uuid)
returns table (id uuid,action text,note text,actor_name text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  if v_lgu_id is null or not exists (
    select 1 from public.lgu_incident_escalations escalation
    where escalation.id = p_escalation_id and escalation.lgu_id = v_lgu_id
  ) then
    raise exception 'escalation history not found or not permitted';
  end if;
  return query select event.id,event.action,event.note,
    coalesce(nullif(profile.display_name,''),'Authorized administrator'),event.created_at
  from public.lgu_incident_escalation_events event
  left join public.profiles profile on profile.id = event.actor_id
  where event.escalation_id = p_escalation_id and event.lgu_id = v_lgu_id
  order by event.created_at,event.id;
end;
$$;

create or replace function public.update_lgu_incident_escalation(p_escalation_id uuid,p_status text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_escalation public.lgu_incident_escalations%rowtype; v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active' order by membership.created_at limit 1;
  if v_lgu_id is null then raise exception 'active LGU administrator access is required'; end if;
  select escalation.* into v_escalation from public.lgu_incident_escalations escalation
  where escalation.id = p_escalation_id and escalation.lgu_id = v_lgu_id for update;
  if not found then raise exception 'escalated incident not found'; end if;
  if length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'add a response note'; end if;
  if not ((v_escalation.status = 'pending' and p_status = 'acknowledged')
    or (v_escalation.status = 'acknowledged' and p_status = 'resolved')) then
    raise exception 'invalid LGU escalation status transition';
  end if;
  update public.lgu_incident_escalations set status = p_status,lgu_response_note = trim(p_note),updated_at = now()
  where id = v_escalation.id;
  insert into public.lgu_incident_escalation_events(escalation_id,lgu_id,actor_id,action,note)
  values (v_escalation.id,v_lgu_id,(select auth.uid()),p_status,trim(p_note));
end;
$$;

revoke all on function public.create_lgu_administrator_invitation(text,text,text) from public,anon;
revoke all on function public.list_platform_lgu_directory() from public,anon;
revoke all on function public.get_public_invitation_kind(text) from public;
revoke all on function public.accept_lgu_administrator_invitation(text) from public,anon;
revoke all on function public.create_lgu_barangay_with_captain(text,text,text) from public,anon;
revoke all on function public.create_lgu_captain_invitation(uuid,text) from public,anon;
revoke all on function public.list_lgu_barangays() from public,anon;
revoke all on function public.escalate_incident_to_lgu(uuid,text) from public,anon;
revoke all on function public.list_lgu_escalated_incident_ids(uuid,uuid[]) from public,anon;
revoke all on function public.list_captain_lgu_incident_updates(uuid,uuid[]) from public,anon;
revoke all on function public.list_captain_lgu_incident_history(uuid,uuid) from public,anon;
revoke all on function public.list_lgu_incident_escalations(text) from public,anon;
revoke all on function public.list_lgu_incident_escalation_history(uuid) from public,anon;
revoke all on function public.update_lgu_incident_escalation(uuid,text,text) from public,anon;
grant execute on function public.create_lgu_administrator_invitation(text,text,text) to authenticated;
grant execute on function public.list_platform_lgu_directory() to authenticated;
grant execute on function public.get_public_invitation_kind(text) to anon,authenticated;
grant execute on function public.accept_lgu_administrator_invitation(text) to authenticated;
grant execute on function public.create_lgu_barangay_with_captain(text,text,text) to authenticated;
grant execute on function public.create_lgu_captain_invitation(uuid,text) to authenticated;
grant execute on function public.list_lgu_barangays() to authenticated;
grant execute on function public.escalate_incident_to_lgu(uuid,text) to authenticated;
grant execute on function public.list_lgu_escalated_incident_ids(uuid,uuid[]) to authenticated;
grant execute on function public.list_captain_lgu_incident_updates(uuid,uuid[]) to authenticated;
grant execute on function public.list_captain_lgu_incident_history(uuid,uuid) to authenticated;
grant execute on function public.list_lgu_incident_escalations(text) to authenticated;
grant execute on function public.list_lgu_incident_escalation_history(uuid) to authenticated;
grant execute on function public.update_lgu_incident_escalation(uuid,text,text) to authenticated;

-- Retire the old platform-to-barangay provisioning path so new workspaces and
-- Captain accounts can only be created through the municipality hierarchy.
revoke all on function public.create_barangay_onboarding(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.create_platform_captain_invitation(text,text) from public,anon,authenticated;
