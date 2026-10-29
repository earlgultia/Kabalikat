-- Deliver an in-app notification when a published role-targeted announcement
-- is reassigned to a different barangay role.
create or replace function public.notify_published_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'published'
    or (new.expires_at is not null and new.expires_at <= now()) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'published'
      and old.audience = new.audience
      and old.audience_role_id is not distinct from new.audience_role_id
      and old.barangay_id = new.barangay_id then
      return new;
    end if;
  end if;

  insert into public.community_notifications (
    barangay_id,
    recipient_id,
    resource_type,
    resource_id
  )
  select
    new.barangay_id,
    m.user_id,
    'announcement',
    new.id
  from public.barangay_memberships m
  where m.barangay_id = new.barangay_id
    and m.status = 'active'
    and m.user_id <> new.created_by
    and not exists (
      select 1
      from public.community_notification_preferences pref
      where pref.user_id = m.user_id
        and pref.barangay_id = new.barangay_id
        and pref.resource_type = 'announcement'
        and pref.enabled = false
    )
    and (
      new.audience = 'public'
      or (
        new.audience = 'residents'
        and exists (
          select 1
          from public.role_definitions r
          where r.id = m.role_id
            and r.key = 'resident'
            and r.scope = 'barangay'
        )
      )
      or (
        new.audience = 'officials'
        and exists (
          select 1
          from public.role_permissions rp
          join public.permissions p
            on p.id = rp.permission_id
           and p.key = 'announcement.officials.read'
          left join public.membership_permissions mp
            on mp.membership_id = m.id
           and mp.permission_id = p.id
          where rp.role_id = m.role_id
            and coalesce(mp.effect, 'allow') = 'allow'
        )
      )
      or (
        new.audience = 'role'
        and m.role_id = new.audience_role_id
        and exists (
          select 1
          from public.role_definitions r
          where r.id = m.role_id
            and r.scope = 'barangay'
        )
      )
    )
  on conflict (recipient_id, resource_type, resource_id) do nothing;

  return new;
end;
$$;

drop trigger if exists announcements_notify_published on public.announcements;
create trigger announcements_notify_published
  after insert or update of status, audience, audience_role_id, barangay_id
  on public.announcements
  for each row
  execute function public.notify_published_announcement();

revoke all on function public.notify_published_announcement()
  from public, anon, authenticated;
