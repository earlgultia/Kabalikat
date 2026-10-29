-- Curated SK project summaries require an explicit Captain publication decision.
create table public.sk_public_accomplishments (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  project_id uuid not null references public.sk_projects(id) on delete restrict,
  title text not null,
  summary text not null,
  status text not null default 'submitted' check (status in ('submitted','published','returned')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  published_at timestamptz,
  review_note text,
  unique (barangay_id, project_id),
  check (length(trim(title)) between 3 and 180),
  check (length(trim(summary)) between 20 and 2000),
  check ((status = 'submitted') = (reviewed_at is null)),
  check ((status = 'published') = (published_at is not null)),
  check (review_note is null or length(review_note) <= 1000)
);
create index sk_public_accomplishments_tenant_idx
  on public.sk_public_accomplishments(barangay_id,status,published_at desc);

alter table public.sk_public_accomplishments enable row level security;
create policy sk_public_accomplishments_read on public.sk_public_accomplishments for select to authenticated
  using (public.has_tenant_permission(barangay_id,'sk.manage')
    or public.has_tenant_permission(barangay_id,'sk.review')
    or (status = 'published' and public.is_active_member(barangay_id)));
revoke all on public.sk_public_accomplishments from anon,authenticated;
grant select on public.sk_public_accomplishments to authenticated;

create or replace function public.submit_sk_accomplishment(
  p_barangay_id uuid,p_project_id uuid,p_title text,p_summary text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_tenant_permission(p_barangay_id,'sk.manage') then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 180
    or length(trim(coalesce(p_summary,''))) not between 20 and 2000 then raise exception 'invalid accomplishment summary'; end if;
  if not exists (select 1 from public.sk_projects p where p.id = p_project_id
    and p.barangay_id = p_barangay_id and p.status = 'completed') then raise exception 'project is not completed'; end if;
  insert into public.sk_public_accomplishments(barangay_id,project_id,title,summary,created_by)
    values (p_barangay_id,p_project_id,trim(p_title),trim(p_summary),auth.uid())
  on conflict (barangay_id,project_id) do update set title = excluded.title,summary = excluded.summary,
    status = 'submitted',created_by = auth.uid(),created_at = now(),reviewed_by = null,reviewed_at = null,published_at = null,review_note = null
    where public.sk_public_accomplishments.status = 'returned'
      and public.sk_public_accomplishments.created_by = auth.uid()
  returning id into v_id;
  if v_id is null then raise exception 'summary already submitted or published'; end if;
  return v_id;
end;
$$;

create or replace function public.review_sk_accomplishment(p_accomplishment_id uuid,p_publish boolean,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.sk_public_accomplishments%rowtype;
begin
  select * into v_item from public.sk_public_accomplishments where id = p_accomplishment_id for update;
  if not found or not public.has_tenant_permission(v_item.barangay_id,'sk.review') then raise exception 'not authorized'; end if;
  if v_item.status <> 'submitted' or v_item.created_by = auth.uid() then raise exception 'summary is not available for independent review'; end if;
  if not p_publish and length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'a return reason is required'; end if;
  update public.sk_public_accomplishments set status = case when p_publish then 'published' else 'returned' end,
    reviewed_by = auth.uid(),reviewed_at = now(),published_at = case when p_publish then now() else null end,
    review_note = case when p_publish then null else trim(p_note) end where id = v_item.id;
end;
$$;

revoke all on function public.submit_sk_accomplishment(uuid,uuid,text,text) from public,anon;
revoke all on function public.review_sk_accomplishment(uuid,boolean,text) from public,anon;
grant execute on function public.submit_sk_accomplishment(uuid,uuid,text,text) to authenticated;
grant execute on function public.review_sk_accomplishment(uuid,boolean,text) to authenticated;
