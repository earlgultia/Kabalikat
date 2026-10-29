-- Persist in-app delivery receipts for newly published announcements and
-- disaster advisories. No email/SMS provider is invoked by this migration.
create table public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  resource_type text not null check (resource_type in ('announcement','disaster_advisory')),
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_id,resource_type,resource_id)
);
create index community_notifications_inbox_idx
  on public.community_notifications(recipient_id,barangay_id,created_at desc);

alter table public.community_notifications enable row level security;
create policy community_notifications_read on public.community_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and exists (select 1 from public.barangay_memberships m
      where m.user_id = (select auth.uid()) and m.barangay_id = community_notifications.barangay_id and m.status = 'active')
    and (
      (resource_type = 'announcement' and exists (
        select 1 from public.announcements a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
      or (resource_type = 'disaster_advisory' and exists (
        select 1 from public.disaster_advisories a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
    )
  );
create policy community_notifications_mark_read on public.community_notifications
  for update to authenticated using (
    recipient_id = (select auth.uid()) and read_at is null
    and exists (select 1 from public.barangay_memberships m
      where m.user_id = (select auth.uid()) and m.barangay_id = community_notifications.barangay_id and m.status = 'active')
    and (
      (resource_type = 'announcement' and exists (
        select 1 from public.announcements a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
      or (resource_type = 'disaster_advisory' and exists (
        select 1 from public.disaster_advisories a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
    )
  ) with check (
    recipient_id = (select auth.uid()) and read_at is not null
    and exists (select 1 from public.barangay_memberships m
      where m.user_id = (select auth.uid()) and m.barangay_id = community_notifications.barangay_id and m.status = 'active')
    and (
      (resource_type = 'announcement' and exists (
        select 1 from public.announcements a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
      or (resource_type = 'disaster_advisory' and exists (
        select 1 from public.disaster_advisories a where a.id = resource_id and a.barangay_id = community_notifications.barangay_id
          and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      ))
    )
  );
revoke all on public.community_notifications from anon,authenticated;
grant select on public.community_notifications to authenticated;
grant update (read_at) on public.community_notifications to authenticated;

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
create trigger announcements_notify_published
  after insert or update of status,audience,barangay_id on public.announcements
  for each row execute function public.notify_published_announcement();

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
create trigger disaster_advisories_notify_published
  after insert or update of status on public.disaster_advisories
  for each row execute function public.notify_published_disaster_advisory();
