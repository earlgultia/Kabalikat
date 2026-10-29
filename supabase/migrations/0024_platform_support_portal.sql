-- Phase 6: tenant-scoped support requests with a platform-admin support queue.
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  category text not null check (category in ('account','bug','data','question','other')),
  subject text not null,
  description text not null,
  status text not null default 'new' check (status in ('new','in_progress','waiting_on_requester','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,barangay_id),
  check (length(trim(subject)) between 3 and 180),
  check (length(trim(description)) between 3 and 4000)
);
create index support_tickets_requester_idx on public.support_tickets(requester_id,created_at desc);
create index support_tickets_queue_idx on public.support_tickets(status,created_at desc);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  visibility text not null check (visibility in ('requester','internal')),
  body text not null,
  created_at timestamptz not null default now(),
  check (length(trim(body)) between 1 and 4000)
);
create index support_messages_ticket_idx on public.support_messages(ticket_id,created_at);

create table public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('ticket_created','status_changed')),
  from_status text,
  to_status text,
  created_at timestamptz not null default now(),
  check ((action = 'status_changed') = (from_status is not null and to_status is not null))
);
create index support_ticket_events_ticket_idx on public.support_ticket_events(ticket_id,created_at);

create or replace function public.create_support_ticket(p_barangay_id uuid,p_category text,p_subject text,p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_member(p_barangay_id) then raise exception 'not authorized'; end if;
  if p_category not in ('account','bug','data','question','other') or length(trim(coalesce(p_subject,''))) not between 3 and 180
    or length(trim(coalesce(p_description,''))) not between 3 and 4000 then raise exception 'invalid support request'; end if;
  insert into public.support_tickets(barangay_id,requester_id,category,subject,description)
    values (p_barangay_id,auth.uid(),p_category,trim(p_subject),trim(p_description)) returning id into v_id;
  insert into public.support_ticket_events(ticket_id,actor_id,action,to_status)
    values (v_id,auth.uid(),'ticket_created','new');
  return v_id;
end;
$$;

create or replace function public.add_support_message(p_ticket_id uuid,p_body text,p_internal boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ticket public.support_tickets%rowtype; v_id uuid; v_admin boolean;
begin
  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'support request not found'; end if;
  v_admin := public.is_platform_administrator();
  if not v_admin and (v_ticket.requester_id <> auth.uid() or not public.is_active_member(v_ticket.barangay_id)) then raise exception 'not authorized'; end if;
  if p_internal and not v_admin then raise exception 'internal notes are restricted to platform administrators'; end if;
  if not v_admin and v_ticket.status in ('resolved','closed') then raise exception 'this request is closed'; end if;
  if length(trim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'message must be 1 to 4000 characters'; end if;
  insert into public.support_messages(ticket_id,author_id,visibility,body)
    values (v_ticket.id,auth.uid(),case when p_internal then 'internal' else 'requester' end,trim(p_body)) returning id into v_id;
  if not v_admin and v_ticket.status = 'waiting_on_requester' then
    update public.support_tickets set status = 'in_progress',updated_at = now() where id = v_ticket.id;
    insert into public.support_ticket_events(ticket_id,actor_id,action,from_status,to_status)
      values (v_ticket.id,auth.uid(),'status_changed','waiting_on_requester','in_progress');
  else
    update public.support_tickets set updated_at = now() where id = v_ticket.id;
  end if;
  return v_id;
end;
$$;

create or replace function public.set_support_ticket_status(p_ticket_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ticket public.support_tickets%rowtype;
begin
  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found or not public.is_platform_administrator() then raise exception 'not authorized'; end if;
  if p_status not in ('new','in_progress','waiting_on_requester','resolved','closed') then raise exception 'invalid support status'; end if;
  if v_ticket.status = p_status then return; end if;
  update public.support_tickets set status = p_status,updated_at = now() where id = v_ticket.id;
  insert into public.support_ticket_events(ticket_id,actor_id,action,from_status,to_status)
    values (v_ticket.id,auth.uid(),'status_changed',v_ticket.status,p_status);
end;
$$;

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_ticket_events enable row level security;
create policy support_tickets_read on public.support_tickets for select to authenticated
  using (public.is_platform_administrator()
    or (requester_id = (select auth.uid()) and public.is_active_member(barangay_id)));
create policy support_messages_read on public.support_messages for select to authenticated
  using (public.is_platform_administrator()
    or (visibility = 'requester' and exists (select 1 from public.support_tickets t
      where t.id = ticket_id and t.requester_id = (select auth.uid()) and public.is_active_member(t.barangay_id))));
create policy support_ticket_events_read on public.support_ticket_events for select to authenticated
  using (public.is_platform_administrator()
    or exists (select 1 from public.support_tickets t where t.id = ticket_id
      and t.requester_id = (select auth.uid()) and public.is_active_member(t.barangay_id)));
revoke all on public.support_tickets,public.support_messages,public.support_ticket_events from anon,authenticated;
grant select on public.support_tickets,public.support_messages,public.support_ticket_events to authenticated;
revoke all on function public.create_support_ticket(uuid,text,text,text) from public,anon;
revoke all on function public.add_support_message(uuid,text,boolean) from public,anon;
revoke all on function public.set_support_ticket_status(uuid,text) from public,anon;
grant execute on function public.create_support_ticket(uuid,text,text,text) to authenticated;
grant execute on function public.add_support_message(uuid,text,boolean) to authenticated;
grant execute on function public.set_support_ticket_status(uuid,text) to authenticated;
