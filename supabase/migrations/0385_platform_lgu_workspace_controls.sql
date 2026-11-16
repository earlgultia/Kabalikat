-- Platform administrators can suspend or restore an LGU workspace with an
-- auditable reason, independently of its paid subscription period.
create table public.platform_lgu_workspace_status_events (
  id uuid primary key default gen_random_uuid(),
  lgu_id uuid not null references public.local_government_units(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  from_status text not null check (from_status in ('active','suspended')),
  to_status text not null check (to_status in ('active','suspended')),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  created_at timestamptz not null default now(),
  check (from_status <> to_status)
);
create index platform_lgu_workspace_status_events_history_idx
  on public.platform_lgu_workspace_status_events(lgu_id,created_at desc,id desc);
alter table public.platform_lgu_workspace_status_events enable row level security;
revoke all on public.platform_lgu_workspace_status_events from public,anon,authenticated;

create or replace function public.set_platform_lgu_workspace_status(
  p_lgu_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lgu public.local_government_units%rowtype;
  v_reason text := trim(coalesce(p_reason,''));
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if p_status is null or p_status not in ('active','suspended') then
    raise exception 'invalid LGU workspace status';
  end if;
  if length(v_reason) not between 3 and 1000 then
    raise exception 'provide a reason between 3 and 1000 characters';
  end if;

  select lgu.* into v_lgu
  from public.local_government_units lgu
  where lgu.id = p_lgu_id
  for update;
  if not found then
    raise exception 'LGU workspace was not found';
  end if;
  if v_lgu.status = p_status then
    return;
  end if;

  update public.local_government_units
  set status = p_status
  where id = v_lgu.id;

  insert into public.platform_lgu_workspace_status_events(
    lgu_id,actor_id,from_status,to_status,reason
  ) values (
    v_lgu.id,(select auth.uid()),v_lgu.status,p_status,v_reason
  );
end;
$$;

create or replace function public.list_platform_lgu_workspace_status_history(p_lgu_id uuid)
returns table(id uuid,actor_name text,from_status text,to_status text,reason text,created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if not exists(select 1 from public.local_government_units lgu where lgu.id = p_lgu_id) then
    raise exception 'LGU workspace was not found';
  end if;
  return query
  select event.id,
    coalesce(nullif(profile.display_name,''),'Platform administrator'),
    event.from_status,event.to_status,event.reason,event.created_at
  from public.platform_lgu_workspace_status_events event
  left join public.profiles profile on profile.id = event.actor_id
  where event.lgu_id = p_lgu_id
  order by event.created_at desc,event.id desc
  limit 100;
end;
$$;

revoke all on function public.set_platform_lgu_workspace_status(uuid,text,text) from public,anon;
revoke all on function public.list_platform_lgu_workspace_status_history(uuid) from public,anon;
grant execute on function public.set_platform_lgu_workspace_status(uuid,text,text) to authenticated;
grant execute on function public.list_platform_lgu_workspace_status_history(uuid) to authenticated;
