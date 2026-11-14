-- Residency review decisions are final. This protects a verified resident from
-- being rejected by a stale client or a concurrent reviewer action.
create or replace function public.verify_residency(p_resident_id uuid, p_status text, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resident public.residents%rowtype;
  v_verification_id uuid;
  v_latest_status text;
begin
  select * into v_resident
  from public.residents resident
  where resident.id = p_resident_id
  for update;

  if not found or not public.has_tenant_permission(v_resident.barangay_id, 'resident.verify') then
    raise exception 'not authorized';
  end if;
  if v_resident.created_by = (select auth.uid()) then
    raise exception 'another authorized staff member must verify a resident record you created';
  end if;
  if p_status not in ('verified', 'rejected') then
    raise exception 'invalid verification status';
  end if;
  if p_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reason is required';
  end if;

  select verification.status into v_latest_status
  from public.residency_verifications verification
  where verification.resident_id = p_resident_id
    and verification.barangay_id = v_resident.barangay_id
  order by verification.created_at desc, verification.id desc
  limit 1;

  if v_latest_status in ('verified', 'rejected') then
    raise exception 'resident has already been reviewed';
  end if;

  insert into public.residency_verifications(barangay_id, resident_id, status, verified_by, verified_at, reason)
  values (v_resident.barangay_id, p_resident_id, p_status, (select auth.uid()), now(), nullif(trim(p_reason), ''))
  returning id into v_verification_id;

  return v_verification_id;
end;
$$;

revoke all on function public.verify_residency(uuid, text, text) from public, anon;
grant execute on function public.verify_residency(uuid, text, text) to authenticated;
