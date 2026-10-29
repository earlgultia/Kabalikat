-- Residents retain access to public/resident announcements but cannot read
-- messages explicitly addressed to barangay officials.
insert into public.permissions(key,description)
values ('announcement.officials.read','Read announcements addressed to barangay officials')
on conflict (key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.role_definitions r
cross join public.permissions p
where r.scope = 'barangay'
  and r.key <> 'resident'
  and p.key = 'announcement.officials.read'
on conflict do nothing;

drop policy announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (public.has_tenant_permission(barangay_id,'announcement.publish')
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience = 'officials' and public.has_tenant_permission(barangay_id,'announcement.officials.read'))
    or (status = 'published' and (expires_at is null or expires_at > now())
      and audience in ('public','residents') and public.is_active_member(barangay_id)));
