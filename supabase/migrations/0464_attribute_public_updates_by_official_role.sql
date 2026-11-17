-- Attribute public progress by office rather than exposing staff profile names
-- through the resident-facing feed.
alter table public.barangay_official_public_updates
  add column author_role_key text not null default 'barangay_official';

update public.barangay_official_public_updates update_row
set author_role_key = coalesce((
  select role_definition.key
  from public.barangay_memberships membership
  join public.role_definitions role_definition on role_definition.id = membership.role_id
  where membership.barangay_id = update_row.barangay_id
    and membership.user_id = update_row.author_id
    and role_definition.key in ('captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod')
  order by (membership.status = 'active') desc, membership.created_at desc
  limit 1
), 'barangay_official');

alter table public.barangay_official_public_updates
  add constraint barangay_official_public_updates_author_role_check
  check (author_role_key in (
    'captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod',
    'barangay_official'
  ));

create or replace function public.create_barangay_official_public_update(
  p_barangay_id uuid,
  p_update_type text,
  p_title text,
  p_body text
)
returns uuid language plpgsql security definer
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

revoke all on function public.create_barangay_official_public_update(uuid, text, text, text) from public, anon;
grant execute on function public.create_barangay_official_public_update(uuid, text, text, text) to authenticated;
