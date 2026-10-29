-- Phase 5: BHW outreach scheduling without storing patient or participant records.
insert into public.permissions(key,description) values
  ('health.campaign.manage','Create and complete health outreach campaign schedules'),
  ('health.campaign.review','Review and publish health outreach campaigns')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.role_definitions r cross join public.permissions p
where (r.key = 'bhw' and p.key = 'health.campaign.manage')
   or (r.key = 'captain' and p.key = 'health.campaign.review')
on conflict do nothing;

create table public.health_outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  title text not null,
  description text not null default '',
  location text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','published','completed','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  completed_at timestamptz,
  unique (id,barangay_id),
  check (length(trim(title)) between 3 and 180),
  check (length(description) <= 2000),
  check (length(trim(location)) between 2 and 240),
  check (ends_at > starts_at),
  check ((status = 'draft') = (reviewed_by is null)),
  check ((status = 'draft') = (reviewed_at is null)),
  check ((status = 'completed') = (completed_at is not null)),
  check (review_note is null or length(review_note) <= 1000)
);
create index health_outreach_tenant_schedule_idx on public.health_outreach_campaigns(barangay_id,status,starts_at);

create table public.health_outreach_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  campaign_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('campaign_created','campaign_published','campaign_rejected','campaign_completed')),
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (campaign_id,barangay_id) references public.health_outreach_campaigns(id,barangay_id) on delete restrict,
  check (length(note) <= 1000)
);
create index health_outreach_events_campaign_idx on public.health_outreach_events(barangay_id,campaign_id,created_at);

create or replace function public.create_health_outreach_campaign(
  p_barangay_id uuid,p_title text,p_description text,p_location text,p_starts_at timestamptz,p_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'health.campaign.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 180 or length(coalesce(p_description,'')) > 2000
    or length(trim(coalesce(p_location,''))) not between 2 and 240 or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid outreach campaign details';
  end if;
  insert into public.health_outreach_campaigns(barangay_id,title,description,location,starts_at,ends_at,created_by)
  values (p_barangay_id,trim(p_title),trim(coalesce(p_description,'')),trim(p_location),p_starts_at,p_ends_at,auth.uid()) returning id into v_id;
  insert into public.health_outreach_events(barangay_id,campaign_id,actor_id,action,note)
  values (p_barangay_id,v_id,auth.uid(),'campaign_created',trim(p_title));
  return v_id;
end;
$$;

create or replace function public.review_health_outreach_campaign(p_campaign_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign public.health_outreach_campaigns%rowtype;
begin
  select * into v_campaign from public.health_outreach_campaigns where id = p_campaign_id for update;
  if not found or not public.has_tenant_permission(v_campaign.barangay_id,'health.campaign.review') then raise exception 'not authorized'; end if;
  if v_campaign.status <> 'draft' then raise exception 'campaign is no longer awaiting review'; end if;
  if p_approve and v_campaign.created_by = auth.uid() then raise exception 'campaign creator cannot approve their own campaign'; end if;
  if not p_approve and length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'a reason is required to reject this campaign'; end if;
  update public.health_outreach_campaigns set status = case when p_approve then 'published' else 'cancelled' end,
    reviewed_by = auth.uid(),reviewed_at = now(),review_note = case when p_approve then null else trim(p_note) end
    where id = v_campaign.id;
  insert into public.health_outreach_events(barangay_id,campaign_id,actor_id,action,note)
  values (v_campaign.barangay_id,v_campaign.id,auth.uid(),case when p_approve then 'campaign_published' else 'campaign_rejected' end,
    case when p_approve then '' else trim(p_note) end);
end;
$$;

create or replace function public.complete_health_outreach_campaign(p_campaign_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign public.health_outreach_campaigns%rowtype;
begin
  select * into v_campaign from public.health_outreach_campaigns where id = p_campaign_id for update;
  if not found or not public.has_tenant_permission(v_campaign.barangay_id,'health.campaign.manage') then raise exception 'not authorized'; end if;
  if v_campaign.status <> 'published' or v_campaign.ends_at > now() then raise exception 'campaign cannot be completed before its scheduled end'; end if;
  update public.health_outreach_campaigns set status = 'completed',completed_at = now() where id = v_campaign.id;
  insert into public.health_outreach_events(barangay_id,campaign_id,actor_id,action)
  values (v_campaign.barangay_id,v_campaign.id,auth.uid(),'campaign_completed');
end;
$$;

alter table public.health_outreach_campaigns enable row level security;
alter table public.health_outreach_events enable row level security;
create policy health_outreach_campaigns_read on public.health_outreach_campaigns for select to authenticated
  using (public.has_tenant_permission(barangay_id,'health.campaign.manage')
    or public.has_tenant_permission(barangay_id,'health.campaign.review')
    or (public.is_active_member(barangay_id) and status in ('published','completed')));
create policy health_outreach_events_read on public.health_outreach_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'health.campaign.manage')
    or public.has_tenant_permission(barangay_id,'health.campaign.review'));
revoke all on public.health_outreach_campaigns,public.health_outreach_events from anon,authenticated;
grant select on public.health_outreach_campaigns,public.health_outreach_events to authenticated;
revoke all on function public.create_health_outreach_campaign(uuid,text,text,text,timestamptz,timestamptz) from public,anon;
revoke all on function public.review_health_outreach_campaign(uuid,boolean,text) from public,anon;
revoke all on function public.complete_health_outreach_campaign(uuid) from public,anon;
grant execute on function public.create_health_outreach_campaign(uuid,text,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.review_health_outreach_campaign(uuid,boolean,text) to authenticated;
grant execute on function public.complete_health_outreach_campaign(uuid) to authenticated;
