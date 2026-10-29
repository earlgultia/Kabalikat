-- Extend announcements to one explicitly selected barangay role.
alter table public.announcements
  add column audience_role_id uuid references public.role_definitions(id) on delete restrict;

do $$
declare v_constraint record;
begin
  for v_constraint in
    select c.conname from pg_catalog.pg_constraint c
    where c.conrelid = 'public.announcements'::regclass and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%audience%'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%officials%'
  loop
    execute pg_catalog.format('alter table public.announcements drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.announcements
  add constraint announcements_audience_target_check
    check ((audience in ('public','residents','officials') and audience_role_id is null)
      or (audience = 'role' and audience_role_id is not null));

drop policy announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (public.has_tenant_permission(barangay_id,'announcement.publish')
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience = 'officials' and public.has_tenant_permission(barangay_id,'announcement.officials.read'))
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience = 'public' and public.is_active_member(barangay_id))
    or (status = 'published' and (expires_at is null or expires_at > now()) and audience = 'residents'
      and exists (select 1 from public.barangay_memberships m
        join public.role_definitions r on r.id = m.role_id and r.key = 'resident'
        where m.user_id = (select auth.uid()) and m.barangay_id = announcements.barangay_id and m.status = 'active'))
    or (status = 'published' and (expires_at is null or expires_at > now()) and audience = 'role'
      and exists (select 1 from public.barangay_memberships m
        join public.role_definitions r on r.id = m.role_id and r.scope = 'barangay'
        where m.user_id = (select auth.uid()) and m.barangay_id = announcements.barangay_id
          and m.role_id = announcements.audience_role_id and m.status = 'active')));

drop policy announcements_create on public.announcements;
create policy announcements_create on public.announcements for insert to authenticated
  with check (public.has_tenant_permission(barangay_id,'announcement.publish')
    and created_by = (select auth.uid())
    and (audience_role_id is null or exists (select 1 from public.role_definitions r
      where r.id = audience_role_id and r.scope = 'barangay')));

drop policy announcements_update on public.announcements;
create policy announcements_update on public.announcements for update to authenticated
  using (public.has_tenant_permission(barangay_id,'announcement.publish'))
  with check (public.has_tenant_permission(barangay_id,'announcement.publish')
    and (audience_role_id is null or exists (select 1 from public.role_definitions r
      where r.id = audience_role_id and r.scope = 'barangay')));

grant insert (audience_role_id) on public.announcements to authenticated;
grant update (audience_role_id) on public.announcements to authenticated;

create or replace function public.notify_published_announcement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'published' or (new.expires_at is not null and new.expires_at <= now()) then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'published' and old.audience = new.audience
      and old.audience_role_id is not distinct from new.audience_role_id and old.barangay_id = new.barangay_id then return new; end if;
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
      (new.audience = 'public')
      or (new.audience = 'residents' and exists (select 1 from public.role_definitions r
        where r.id = m.role_id and r.key = 'resident' and r.scope = 'barangay'))
      or (new.audience = 'officials' and exists (
        select 1 from public.role_permissions rp
        join public.permissions p on p.id = rp.permission_id and p.key = 'announcement.officials.read'
        left join public.membership_permissions mp on mp.membership_id = m.id and mp.permission_id = p.id
        where rp.role_id = m.role_id and coalesce(mp.effect,'allow') = 'allow'
      ))
      or (new.audience = 'role' and m.role_id = new.audience_role_id)
    )
  on conflict (recipient_id,resource_type,resource_id) do nothing;
  return new;
end;
$$;
