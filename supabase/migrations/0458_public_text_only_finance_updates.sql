-- Public finance notices contain only voluntary, non-sensitive summaries. They are
-- separate from the private transaction ledger and never accept attachments.
insert into public.permissions (key, description)
values ('finance.public_update', 'Publish text-only public finance updates')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.role_definitions role
join public.permissions permission on permission.key = 'finance.public_update'
where role.key = 'treasurer'
on conflict do nothing;

create table public.barangay_finance_public_updates (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(trim(title)) between 3 and 160),
  body text not null check (length(trim(body)) between 3 and 2000),
  created_at timestamptz not null default now()
);
create index barangay_finance_public_updates_feed_idx
  on public.barangay_finance_public_updates (barangay_id, created_at desc, id desc);
alter table public.barangay_finance_public_updates enable row level security;
create policy barangay_finance_public_updates_read_active_members
  on public.barangay_finance_public_updates for select to authenticated
  using (public.is_active_member(barangay_id));
revoke all on public.barangay_finance_public_updates from anon, authenticated;
grant select on public.barangay_finance_public_updates to authenticated;

create or replace function public.publish_barangay_finance_update(p_barangay_id uuid, p_title text, p_body text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
  v_id uuid := extensions.gen_random_uuid();
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  v_barangay_id := p_barangay_id;
  if auth.uid() is null or v_barangay_id is null
    or not public.has_tenant_permission(v_barangay_id, 'finance.public_update') then
    raise exception 'not authorized to publish a public finance update';
  end if;
  if length(v_title) not between 3 and 160 or length(v_body) not between 3 and 2000 then
    raise exception 'provide a title and an update between 3 and 2000 characters';
  end if;
  insert into public.barangay_finance_public_updates(id, barangay_id, author_id, title, body)
  values (v_id, v_barangay_id, auth.uid(), v_title, v_body);
  return v_id;
end;
$$;
revoke all on function public.publish_barangay_finance_update(uuid, text, text) from public, anon;
grant execute on function public.publish_barangay_finance_update(uuid, text, text) to authenticated;
