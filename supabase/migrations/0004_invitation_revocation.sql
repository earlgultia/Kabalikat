create table public.invitation_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete restrict,
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null check (action in ('created','accepted','revoked')),
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now()
);
create index invitation_events_tenant_idx on public.invitation_events(barangay_id, invitation_id, created_at);

create or replace function public.log_invitation_change()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.invitation_events(invitation_id, barangay_id, actor_id, action, to_status)
    values (new.id, new.barangay_id, (select auth.uid()), 'created', new.status);
    return new;
  end if;
  if new.status is distinct from old.status then
    v_action := case new.status when 'accepted' then 'accepted' when 'revoked' then 'revoked' else 'created' end;
    insert into public.invitation_events(invitation_id, barangay_id, actor_id, action, from_status, to_status)
    values (new.id, new.barangay_id, (select auth.uid()), v_action, old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger invitations_audit_insert after insert on public.invitations
  for each row execute function public.log_invitation_change();
create trigger invitations_audit_update after update on public.invitations
  for each row execute function public.log_invitation_change();

alter table public.invitation_events enable row level security;
create policy invitation_events_read_manager on public.invitation_events for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'membership.read'));
revoke all on public.invitation_events from anon, authenticated;
grant select on public.invitation_events to authenticated;
revoke all on function public.log_invitation_change() from public, anon, authenticated;

create or replace function public.revoke_membership_invitation(p_invitation_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_invitation public.invitations%rowtype;
begin
  select * into v_invitation from public.invitations where id = p_invitation_id for update;
  if not found or not public.has_tenant_permission(v_invitation.barangay_id, 'membership.invite') then
    raise exception 'not authorized';
  end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    raise exception 'invitation is no longer pending';
  end if;
  update public.invitations set status = 'revoked' where id = v_invitation.id;
end;
$$;
revoke all on function public.revoke_membership_invitation(uuid) from public, anon;
grant execute on function public.revoke_membership_invitation(uuid) to authenticated;
