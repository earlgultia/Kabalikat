-- Require an explicit content-safety confirmation at the database boundary
-- before publishing either public text feed. Retire the old RPC entry points so
-- authenticated clients cannot bypass the confirmation.

create or replace function public.create_barangay_official_public_update_confirmed(
  p_barangay_id uuid,
  p_update_type text,
  p_title text,
  p_body text,
  p_confirmed_public boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := extensions.gen_random_uuid();
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_role_key text;
begin
  if auth.uid() is null or p_barangay_id is null
    or not public.has_tenant_permission(p_barangay_id, 'barangay.public_update.create') then
    raise exception 'not authorized to publish a barangay update';
  end if;
  if p_confirmed_public is distinct from true then
    raise exception 'confirm that this update is suitable for the public barangay member feed';
  end if;
  if p_update_type not in ('upcoming_project', 'accomplishment', 'progress')
    or length(v_title) not between 3 and 160
    or length(v_body) not between 3 and 3000 then
    raise exception 'provide an update type, title, and details';
  end if;

  select role.key into v_role_key
  from public.barangay_memberships membership
  join public.role_definitions role on role.id = membership.role_id
  where membership.barangay_id = p_barangay_id
    and membership.user_id = auth.uid()
    and membership.status = 'active'
    and role.key in ('captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod')
  order by membership.created_at desc
  limit 1;
  if v_role_key is null then raise exception 'an authorized barangay official account is required'; end if;

  insert into public.barangay_official_public_updates(
    id, barangay_id, author_id, author_role_key, update_type, title, body
  ) values (v_id, p_barangay_id, auth.uid(), v_role_key, p_update_type, v_title, v_body);
  return v_id;
end;
$$;

create or replace function public.publish_barangay_finance_update_confirmed(
  p_barangay_id uuid,
  p_title text,
  p_body text,
  p_confirmed_public boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid := extensions.gen_random_uuid();
begin
  if auth.uid() is null or p_barangay_id is null
    or not public.has_tenant_permission(p_barangay_id, 'finance.public_update') then
    raise exception 'not authorized to publish a public finance update';
  end if;
  if p_confirmed_public is distinct from true then
    raise exception 'confirm that this finance update contains no confidential details';
  end if;
  if length(v_title) not between 3 and 160 or length(v_body) not between 3 and 2000 then
    raise exception 'provide a title and an update between 3 and 2000 characters';
  end if;

  insert into public.barangay_finance_public_updates(id, barangay_id, author_id, title, body)
  values (v_id, p_barangay_id, auth.uid(), v_title, v_body);
  return v_id;
end;
$$;

revoke all on function public.create_barangay_official_public_update(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.publish_barangay_finance_update(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.create_barangay_official_public_update_confirmed(uuid, text, text, text, boolean)
  from public, anon;
revoke all on function public.publish_barangay_finance_update_confirmed(uuid, text, text, boolean)
  from public, anon;
grant execute on function public.create_barangay_official_public_update_confirmed(uuid, text, text, text, boolean)
  to authenticated;
grant execute on function public.publish_barangay_finance_update_confirmed(uuid, text, text, boolean)
  to authenticated;
