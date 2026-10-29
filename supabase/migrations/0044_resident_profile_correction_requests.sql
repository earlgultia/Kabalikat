-- Residents may ask for corrections to their own identity/contact fields.
-- Staff review the request before official resident records are changed.
create table public.resident_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  resident_id uuid not null,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  proposed_first_name text,
  proposed_last_name text,
  proposed_phone text,
  request_note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  foreign key (resident_id,barangay_id) references public.residents(id,barangay_id) on delete restrict,
  check (proposed_first_name is null or length(trim(proposed_first_name)) between 1 and 100),
  check (proposed_last_name is null or length(trim(proposed_last_name)) between 1 and 100),
  check (proposed_phone is null or length(trim(proposed_phone)) <= 40),
  check (request_note is null or length(trim(request_note)) <= 500),
  check ((status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status <> 'pending' and reviewed_at is not null and reviewed_by is not null)),
  check (proposed_first_name is not null or proposed_last_name is not null or proposed_phone is not null)
);
create index resident_profile_change_requests_queue_idx
  on public.resident_profile_change_requests(barangay_id,status,created_at desc);
create unique index resident_profile_change_one_pending_idx
  on public.resident_profile_change_requests(resident_id) where status = 'pending';

create table public.resident_profile_change_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  request_id uuid not null references public.resident_profile_change_requests(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('submitted','approved','rejected')),
  reason text,
  created_at timestamptz not null default now()
);
create index resident_profile_change_events_request_idx
  on public.resident_profile_change_events(request_id,created_at);

alter table public.resident_profile_change_requests enable row level security;
alter table public.resident_profile_change_events enable row level security;
create policy resident_profile_change_requests_read on public.resident_profile_change_requests
  for select to authenticated using (
    public.has_tenant_permission(barangay_id,'resident.update')
    or requested_by = (select auth.uid())
  );
create policy resident_profile_change_events_read on public.resident_profile_change_events
  for select to authenticated using (
    public.has_tenant_permission(barangay_id,'resident.update')
    or exists (select 1 from public.resident_profile_change_requests r
      where r.id = request_id and r.requested_by = (select auth.uid()))
  );
revoke all on public.resident_profile_change_requests,public.resident_profile_change_events from anon,authenticated;
grant select (
  id,barangay_id,resident_id,proposed_first_name,proposed_last_name,proposed_phone,
  request_note,status,review_reason,created_at,reviewed_at
) on public.resident_profile_change_requests to authenticated;

create or replace function public.submit_resident_profile_change(
  p_resident_id uuid,p_first_name text default null,p_last_name text default null,
  p_phone text default null,p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_barangay_id uuid; v_request_id uuid;
        v_resident public.residents%rowtype;
begin
  select r.* into v_resident from public.residents r
    where r.id = p_resident_id and r.user_id = auth.uid() and r.record_status = 'active' for update;
  if not found then
    raise exception 'no active linked resident record was found';
  end if;
  v_barangay_id := v_resident.barangay_id;
  if not public.is_active_member(v_barangay_id) then raise exception 'no active linked resident record was found'; end if;
  if p_first_name is null and p_last_name is null and p_phone is null then
    raise exception 'provide at least one profile correction';
  end if;
  if p_first_name is not null and length(trim(p_first_name)) not between 1 and 100
    or p_last_name is not null and length(trim(p_last_name)) not between 1 and 100
    or p_phone is not null and length(trim(p_phone)) > 40
    or p_note is not null and length(trim(p_note)) > 500 then
    raise exception 'profile correction details are invalid';
  end if;
  if (p_first_name is null or trim(p_first_name) = v_resident.first_name)
    and (p_last_name is null or trim(p_last_name) = v_resident.last_name)
    and coalesce(nullif(trim(p_phone),''),v_resident.phone) is not distinct from v_resident.phone then
    raise exception 'the requested values do not change the current profile';
  end if;
  if exists (select 1 from public.resident_profile_change_requests r
      where r.resident_id = p_resident_id and r.status = 'pending') then
    raise exception 'a profile correction request is already pending';
  end if;
  insert into public.resident_profile_change_requests(
    barangay_id,resident_id,requested_by,proposed_first_name,proposed_last_name,proposed_phone,request_note
  ) values (
    v_barangay_id,p_resident_id,auth.uid(),nullif(trim(p_first_name),''),
    nullif(trim(p_last_name),''),nullif(trim(p_phone),''),nullif(trim(p_note),'')
  ) returning id into v_request_id;
  insert into public.resident_profile_change_events(barangay_id,request_id,actor_id,action)
    values (v_barangay_id,v_request_id,auth.uid(),'submitted');
  return v_request_id;
end;
$$;

create or replace function public.review_resident_profile_change(
  p_request_id uuid,p_decision text,p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.resident_profile_change_requests%rowtype;
begin
  select * into v_request from public.resident_profile_change_requests
    where id = p_request_id for update;
  if not found or not public.has_tenant_permission(v_request.barangay_id,'resident.update') then
    raise exception 'not authorized';
  end if;
  if v_request.status <> 'pending' then raise exception 'request has already been reviewed'; end if;
  if v_request.requested_by = auth.uid() then raise exception 'requester cannot review their own correction'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'invalid decision'; end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'a reason is required when rejecting a correction';
  end if;
  if p_decision = 'approved' then
    update public.residents set
      first_name = coalesce(v_request.proposed_first_name,first_name),
      last_name = coalesce(v_request.proposed_last_name,last_name),
      phone = coalesce(v_request.proposed_phone,phone),
      updated_at = now()
    where id = v_request.resident_id and barangay_id = v_request.barangay_id;
  end if;
  update public.resident_profile_change_requests set
    status = p_decision,reviewed_by = auth.uid(),reviewed_at = now(),
    review_reason = nullif(trim(p_reason),'')
  where id = v_request.id;
  insert into public.resident_profile_change_events(barangay_id,request_id,actor_id,action,reason)
    values (v_request.barangay_id,v_request.id,auth.uid(),p_decision,nullif(trim(p_reason),''));
end;
$$;
revoke all on function public.submit_resident_profile_change(uuid,text,text,text,text) from public,anon;
grant execute on function public.submit_resident_profile_change(uuid,text,text,text,text) to authenticated;
revoke all on function public.review_resident_profile_change(uuid,text,text) from public,anon;
grant execute on function public.review_resident_profile_change(uuid,text,text) to authenticated;
