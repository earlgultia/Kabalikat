-- Phase 7: limited, audited referrals between barangays. No cross-tenant resident search.
insert into public.permissions(key,description) values
  ('referrals.create','Create limited referrals to another barangay'),
  ('referrals.review','Review and respond to referrals received by this barangay')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where r.key in ('captain','secretary') and p.key in ('referrals.create','referrals.review')
on conflict do nothing;

create table public.interbarangay_referrals (
  id uuid primary key default gen_random_uuid(),
  origin_barangay_id uuid not null references public.barangays(id) on delete restrict,
  receiving_barangay_id uuid not null references public.barangays(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  purpose text not null,
  disclosure_basis text not null,
  shared_information text not null,
  incident_id uuid,
  status text not null default 'submitted' check (status in ('submitted','acknowledged','responded','declined','closed')),
  created_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles(id) on delete restrict,
  acknowledged_at timestamptz,
  responded_by uuid references public.profiles(id) on delete restrict,
  responded_at timestamptz,
  response text,
  closed_at timestamptz,
  foreign key (incident_id,origin_barangay_id) references public.incidents(id,barangay_id) on delete restrict,
  check (origin_barangay_id <> receiving_barangay_id),
  check (length(trim(purpose)) between 3 and 180),
  check (length(trim(disclosure_basis)) between 3 and 500),
  check (length(trim(shared_information)) between 3 and 2000),
  check (response is null or length(response) <= 2000),
  check ((status in ('submitted','declined') and acknowledged_at is null and acknowledged_by is null)
    or (status in ('acknowledged','responded') and acknowledged_at is not null and acknowledged_by is not null)
    or (status = 'closed' and ((acknowledged_at is not null and acknowledged_by is not null and responded_at is not null and responded_by is not null)
      or (acknowledged_at is null and acknowledged_by is null and responded_at is null and responded_by is null)))),
  check ((status in ('submitted','acknowledged') and response is null and responded_at is null and responded_by is null)
    or (status = 'responded' and response is not null and responded_at is not null and responded_by is not null)
    or (status = 'declined' and response is not null and length(trim(response)) between 3 and 500 and responded_at is null and responded_by is null)
    or (status = 'closed' and response is not null and length(trim(response)) >= 3
      and ((responded_at is not null and responded_by is not null) or (responded_at is null and responded_by is null)))),
  check (status <> 'declined' or (response is not null and length(trim(response)) between 3 and 500)),
  check ((status = 'closed') = (closed_at is not null))
);
create index interbarangay_referrals_origin_idx on public.interbarangay_referrals(origin_barangay_id,created_at desc);
create index interbarangay_referrals_receiving_idx on public.interbarangay_referrals(receiving_barangay_id,status,created_at desc);

create table public.interbarangay_referral_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.interbarangay_referrals(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('created','origin_viewed','receiving_viewed','acknowledged','responded','declined','closed')),
  created_at timestamptz not null default now()
);
create index interbarangay_referral_events_referral_idx on public.interbarangay_referral_events(referral_id,created_at desc);

alter table public.interbarangay_referrals enable row level security;
alter table public.interbarangay_referral_events enable row level security;
revoke all on public.interbarangay_referrals,public.interbarangay_referral_events from anon,authenticated;

create or replace function public.get_referral_destinations(p_origin_barangay_id uuid)
returns table(id uuid,name text,municipality text,province text,code text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_tenant_permission(p_origin_barangay_id,'referrals.create') then raise exception 'not authorized'; end if;
  return query select b.id,b.name,b.municipality,b.province,b.code
    from public.barangays b where b.status = 'active' and b.id <> p_origin_barangay_id
    order by b.name,b.municipality;
end;
$$;

create or replace function public.create_interbarangay_referral(
  p_origin_barangay_id uuid,p_receiving_barangay_id uuid,p_purpose text,p_disclosure_basis text,
  p_shared_information text,p_incident_id uuid default null,p_confirmed boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_origin_barangay_id,'referrals.create') then raise exception 'not authorized'; end if;
  if p_confirmed is not true or p_origin_barangay_id = p_receiving_barangay_id
    or not exists (select 1 from public.barangays b where b.id = p_receiving_barangay_id and b.status = 'active')
    or length(trim(coalesce(p_purpose,''))) not between 3 and 180
    or length(trim(coalesce(p_disclosure_basis,''))) not between 3 and 500
    or length(trim(coalesce(p_shared_information,''))) not between 3 and 2000 then
    raise exception 'invalid referral details or disclosure confirmation';
  end if;
  if p_incident_id is not null and (not public.has_tenant_permission(p_origin_barangay_id,'incident.manage')
    or not exists (select 1 from public.incidents i where i.id = p_incident_id and i.barangay_id = p_origin_barangay_id)) then
    raise exception 'incident reference is unavailable';
  end if;
  insert into public.interbarangay_referrals(origin_barangay_id,receiving_barangay_id,created_by,purpose,disclosure_basis,shared_information,incident_id)
  values (p_origin_barangay_id,p_receiving_barangay_id,auth.uid(),trim(p_purpose),trim(p_disclosure_basis),trim(p_shared_information),p_incident_id)
  returning id into v_id;
  insert into public.interbarangay_referral_events(referral_id,actor_id,action) values (v_id,auth.uid(),'created');
  return v_id;
end;
$$;

create or replace function public.list_interbarangay_referrals()
returns table(
  id uuid,origin_barangay_id uuid,origin_name text,receiving_barangay_id uuid,receiving_name text,
  purpose text,disclosure_basis text,shared_information text,incident_id uuid,status text,created_at timestamptz,
  acknowledged_at timestamptz,responded_at timestamptz,response text,closed_at timestamptz,viewer_side text
)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.barangay_memberships m where m.user_id = auth.uid() and m.status = 'active') then
    raise exception 'not authorized';
  end if;
  insert into public.interbarangay_referral_events(referral_id,actor_id,action)
  select r.id,auth.uid(),case when public.has_tenant_permission(r.origin_barangay_id,'referrals.create') then 'origin_viewed' else 'receiving_viewed' end
  from public.interbarangay_referrals r
  where public.has_tenant_permission(r.origin_barangay_id,'referrals.create')
     or public.has_tenant_permission(r.receiving_barangay_id,'referrals.review');
  return query select r.id,r.origin_barangay_id,o.name,r.receiving_barangay_id,d.name,
    r.purpose,r.disclosure_basis,r.shared_information,r.incident_id,r.status,r.created_at,
    r.acknowledged_at,r.responded_at,r.response,r.closed_at,
    case when public.has_tenant_permission(r.origin_barangay_id,'referrals.create') then 'origin' else 'receiving' end
  from public.interbarangay_referrals r
  join public.barangays o on o.id = r.origin_barangay_id
  join public.barangays d on d.id = r.receiving_barangay_id
  where public.has_tenant_permission(r.origin_barangay_id,'referrals.create')
     or public.has_tenant_permission(r.receiving_barangay_id,'referrals.review')
  order by r.created_at desc;
end;
$$;

create or replace function public.acknowledge_interbarangay_referral(p_referral_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ref public.interbarangay_referrals%rowtype;
begin
  select * into v_ref from public.interbarangay_referrals where id = p_referral_id for update;
  if not found or not public.has_tenant_permission(v_ref.receiving_barangay_id,'referrals.review') then raise exception 'not authorized'; end if;
  if v_ref.status <> 'submitted' then raise exception 'referral is no longer awaiting acknowledgment'; end if;
  update public.interbarangay_referrals set status = 'acknowledged',acknowledged_by = auth.uid(),acknowledged_at = now() where id = v_ref.id;
  insert into public.interbarangay_referral_events(referral_id,actor_id,action) values (v_ref.id,auth.uid(),'acknowledged');
end;
$$;

create or replace function public.respond_interbarangay_referral(p_referral_id uuid,p_response text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ref public.interbarangay_referrals%rowtype;
begin
  select * into v_ref from public.interbarangay_referrals where id = p_referral_id for update;
  if not found or not public.has_tenant_permission(v_ref.receiving_barangay_id,'referrals.review') then raise exception 'not authorized'; end if;
  if v_ref.status <> 'acknowledged' or length(trim(coalesce(p_response,''))) not between 3 and 2000 then raise exception 'invalid referral response'; end if;
  update public.interbarangay_referrals set status = 'responded',responded_by = auth.uid(),responded_at = now(),response = trim(p_response) where id = v_ref.id;
  insert into public.interbarangay_referral_events(referral_id,actor_id,action) values (v_ref.id,auth.uid(),'responded');
end;
$$;

create or replace function public.decline_interbarangay_referral(p_referral_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ref public.interbarangay_referrals%rowtype;
begin
  select * into v_ref from public.interbarangay_referrals where id = p_referral_id for update;
  if not found or not public.has_tenant_permission(v_ref.receiving_barangay_id,'referrals.review') then raise exception 'not authorized'; end if;
  if v_ref.status <> 'submitted' or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'invalid referral decline'; end if;
  update public.interbarangay_referrals set status = 'declined',response = trim(p_reason) where id = v_ref.id;
  insert into public.interbarangay_referral_events(referral_id,actor_id,action) values (v_ref.id,auth.uid(),'declined');
end;
$$;

create or replace function public.close_interbarangay_referral(p_referral_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ref public.interbarangay_referrals%rowtype;
begin
  select * into v_ref from public.interbarangay_referrals where id = p_referral_id for update;
  if not found or not public.has_tenant_permission(v_ref.origin_barangay_id,'referrals.create') then raise exception 'not authorized'; end if;
  if v_ref.status not in ('responded','declined') then raise exception 'referral is not ready to close'; end if;
  update public.interbarangay_referrals set status = 'closed',closed_at = now() where id = v_ref.id;
  insert into public.interbarangay_referral_events(referral_id,actor_id,action) values (v_ref.id,auth.uid(),'closed');
end;
$$;

revoke all on function public.get_referral_destinations(uuid) from public,anon;
revoke all on function public.create_interbarangay_referral(uuid,uuid,text,text,text,uuid,boolean) from public,anon;
revoke all on function public.list_interbarangay_referrals() from public,anon;
revoke all on function public.acknowledge_interbarangay_referral(uuid) from public,anon;
revoke all on function public.respond_interbarangay_referral(uuid,text) from public,anon;
revoke all on function public.decline_interbarangay_referral(uuid,text) from public,anon;
revoke all on function public.close_interbarangay_referral(uuid) from public,anon;
grant execute on function public.get_referral_destinations(uuid) to authenticated;
grant execute on function public.create_interbarangay_referral(uuid,uuid,text,text,text,uuid,boolean) to authenticated;
grant execute on function public.list_interbarangay_referrals() to authenticated;
grant execute on function public.acknowledge_interbarangay_referral(uuid) to authenticated;
grant execute on function public.respond_interbarangay_referral(uuid,text) to authenticated;
grant execute on function public.decline_interbarangay_referral(uuid,text) to authenticated;
grant execute on function public.close_interbarangay_referral(uuid) to authenticated;
