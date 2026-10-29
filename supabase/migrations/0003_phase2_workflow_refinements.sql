-- Keep a single household head and preserve rejected document applications for resubmission.
-- If the earlier workflow marked multiple members as head, keep the first recorded head.
with ranked_heads as (
  select household_id, resident_id,
    row_number() over (partition by household_id order by created_at, resident_id) as position
  from public.household_members
  where is_head
)
update public.household_members hm set is_head = false
from ranked_heads rh
where rh.position > 1 and hm.household_id = rh.household_id and hm.resident_id = rh.resident_id;

create unique index household_single_head_idx on public.household_members(household_id)
  where is_head;

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
  values (p_barangay_id, v_household_id, v_resident_id, p_household_id is null);
  insert into public.residency_verifications(barangay_id, resident_id)
  values (p_barangay_id, v_resident_id);
  return v_resident_id;
end;
$$;

create or replace function public.resubmit_document_request(p_request_id uuid, p_purpose text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_request public.document_requests%rowtype;
begin
  select * into v_request from public.document_requests where id = p_request_id for update;
  if not found or v_request.status <> 'rejected' then raise exception 'request cannot be resubmitted'; end if;
  if not public.is_active_member(v_request.barangay_id) or not exists (
    select 1 from public.residents r where r.id = v_request.resident_id and r.user_id = auth.uid()
  ) then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_purpose, ''))) not between 3 and 500 then raise exception 'invalid request purpose'; end if;
  update public.document_requests set status = 'pending', purpose = trim(p_purpose),
    rejection_reason = null, reviewed_by = null, reviewed_at = null
    where id = v_request.id;
  insert into public.document_request_events(barangay_id, request_id, actor_id, from_status, to_status, reason)
  values (v_request.barangay_id, v_request.id, auth.uid(), 'rejected', 'pending', 'Applicant resubmitted the request');
end;
$$;

revoke all on function public.resubmit_document_request(uuid,text) from public, anon;
grant execute on function public.resubmit_document_request(uuid,text) to authenticated;
