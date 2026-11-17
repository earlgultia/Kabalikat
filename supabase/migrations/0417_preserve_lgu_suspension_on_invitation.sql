-- Reissuing an administrator invitation must not implicitly restore a
-- suspended LGU workspace. Restoration remains an explicit platform action.
create or replace function public.create_lgu_administrator_invitation(
  p_municipality text,
  p_province text,
  p_email text
)
returns table (lgu_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lgu_id uuid;
  v_lgu_status text;
  v_token text;
  v_expiry timestamptz := now() + interval '7 days';
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  if length(trim(coalesce(p_municipality, ''))) not between 2 and 120
    or length(trim(coalesce(p_province, ''))) not between 2 and 120
    or coalesce(p_email, '') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'enter a valid municipality, province, and LGU administrator email';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    lower(trim(p_municipality)) || '|' || lower(trim(p_province)), 36601
  ));

  insert into public.local_government_units (municipality, province)
  values (trim(p_municipality), trim(p_province))
  on conflict (lower(trim(municipality)), lower(trim(province))) do nothing
  returning id, status into v_lgu_id, v_lgu_status;

  if v_lgu_id is null then
    select lgu.id, lgu.status
      into v_lgu_id, v_lgu_status
    from public.local_government_units as lgu
    where lower(trim(lgu.municipality)) = lower(trim(p_municipality))
      and lower(trim(lgu.province)) = lower(trim(p_province))
    for update;
  end if;

  if v_lgu_status is distinct from 'active' then
    raise exception 'this municipality LGU workspace is suspended; restore it before issuing an invitation';
  end if;

  -- Attach legacy workspaces only when both location fields match after
  -- case and whitespace normalization.
  update public.barangays as barangay
  set lgu_id = v_lgu_id
  where barangay.lgu_id is null
    and lower(trim(barangay.municipality)) = lower(trim(p_municipality))
    and lower(trim(barangay.province)) = lower(trim(p_province));

  if exists (
    select 1 from public.lgu_memberships as membership
    where membership.lgu_id = v_lgu_id and membership.status = 'active'
  ) then
    raise exception 'this municipality already has an active LGU administrator';
  end if;

  update public.lgu_invitations as invitation
  set status = 'revoked'
  where invitation.lgu_id = v_lgu_id and invitation.status = 'pending';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.lgu_invitations (
    lgu_id, invited_email, token_hash, invited_by, expires_at
  ) values (
    v_lgu_id,
    lower(trim(p_email)),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    (select auth.uid()),
    v_expiry
  );

  return query select v_lgu_id, v_token, v_expiry;
end;
$$;
