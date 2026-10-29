-- Let each active member choose which in-app community updates are delivered.
create table public.community_notification_preferences (
  user_id uuid not null references public.profiles(id) on delete restrict,
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  resource_type text not null check (resource_type in ('announcement','disaster_advisory')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id,barangay_id,resource_type)
);
create function public.update_community_notification_preference_timestamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger community_notification_preferences_updated
  before update on public.community_notification_preferences
  for each row execute function public.update_community_notification_preference_timestamp();

alter table public.community_notification_preferences enable row level security;
create policy community_notification_preferences_read on public.community_notification_preferences
  for select to authenticated using (
    user_id = (select auth.uid()) and public.is_active_member(barangay_id)
  );
create policy community_notification_preferences_insert on public.community_notification_preferences
  for insert to authenticated with check (
    user_id = (select auth.uid()) and public.is_active_member(barangay_id)
  );
create policy community_notification_preferences_update on public.community_notification_preferences
  for update to authenticated using (
    user_id = (select auth.uid()) and public.is_active_member(barangay_id)
  ) with check (
    user_id = (select auth.uid()) and public.is_active_member(barangay_id)
  );
revoke all on public.community_notification_preferences from anon,authenticated;
grant select,insert on public.community_notification_preferences to authenticated;
grant update (enabled) on public.community_notification_preferences to authenticated;

create or replace function public.notify_published_announcement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'published' or (new.expires_at is not null and new.expires_at <= now()) then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'published' and old.audience = new.audience and old.barangay_id = new.barangay_id then return new; end if;
  end if;
  insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
  select new.barangay_id,m.user_id,'announcement',new.id
  from public.barangay_memberships m
  where m.barangay_id = new.barangay_id and m.status = 'active'
    and m.user_id <> new.created_by
    and not exists (select 1 from public.community_notification_preferences pref
      where pref.user_id = m.user_id and pref.barangay_id = new.barangay_id
        and pref.resource_type = 'announcement' and pref.enabled = false)
    and (
      new.audience in ('public','residents')
      or exists (
        select 1 from public.role_permissions rp
        join public.permissions p on p.id = rp.permission_id and p.key = 'announcement.officials.read'
        left join public.membership_permissions mp on mp.membership_id = m.id and mp.permission_id = p.id
        where rp.role_id = m.role_id and coalesce(mp.effect,'allow') = 'allow'
      )
    )
  on conflict (recipient_id,resource_type,resource_id) do nothing;
  return new;
end;
$$;

create or replace function public.notify_published_disaster_advisory()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'published' or (new.expires_at is not null and new.expires_at <= now()) then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;
  insert into public.community_notifications(barangay_id,recipient_id,resource_type,resource_id)
  select new.barangay_id,m.user_id,'disaster_advisory',new.id
  from public.barangay_memberships m
  where m.barangay_id = new.barangay_id and m.status = 'active'
    and m.user_id <> new.created_by
    and not exists (select 1 from public.community_notification_preferences pref
      where pref.user_id = m.user_id and pref.barangay_id = new.barangay_id
        and pref.resource_type = 'disaster_advisory' and pref.enabled = false)
    and exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id and p.key = 'disaster.read'
      left join public.membership_permissions mp on mp.membership_id = m.id and mp.permission_id = p.id
      where rp.role_id = m.role_id and coalesce(mp.effect,'allow') = 'allow'
    )
  on conflict (recipient_id,resource_type,resource_id) do nothing;
  return new;
end;
$$;
