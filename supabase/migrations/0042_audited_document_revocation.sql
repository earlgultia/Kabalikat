-- Let authorized document staff revoke an issued record with an auditable reason.
alter table public.issued_documents
  add constraint issued_documents_id_barangay_unique unique (id,barangay_id);

create table public.issued_document_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  issued_document_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('revoked')),
  reason text not null,
  created_at timestamptz not null default now(),
  foreign key (issued_document_id,barangay_id)
    references public.issued_documents(id,barangay_id) on delete restrict,
  check (length(trim(reason)) between 3 and 1000)
);
create index issued_document_events_document_idx
  on public.issued_document_events(issued_document_id,created_at desc);

alter table public.issued_document_events enable row level security;
create policy issued_document_events_read on public.issued_document_events for select to authenticated
  using (public.has_tenant_permission(barangay_id,'document.request.read')
    or exists (
      select 1 from public.issued_documents d
      join public.document_requests r on r.id = d.request_id and r.barangay_id = d.barangay_id
      join public.residents resident on resident.id = r.resident_id
      where d.id = issued_document_id and d.barangay_id = issued_document_events.barangay_id
        and resident.user_id = (select auth.uid())
    ));
revoke all on public.issued_document_events from anon,authenticated;
grant select on public.issued_document_events to authenticated;

create or replace function public.revoke_issued_document(p_request_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_document public.issued_documents%rowtype;
begin
  select * into v_document from public.issued_documents where request_id = p_request_id for update;
  if not found or not public.has_tenant_permission(v_document.barangay_id,'document.issue') then raise exception 'not authorized'; end if;
  if v_document.verification_status <> 'valid' then raise exception 'issued document is no longer valid'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'a revocation reason is required'; end if;
  update public.issued_documents set verification_status = 'revoked' where id = v_document.id;
  insert into public.issued_document_events(barangay_id,issued_document_id,actor_id,action,reason)
    values (v_document.barangay_id,v_document.id,auth.uid(),'revoked',trim(p_reason));
end;
$$;
revoke all on function public.revoke_issued_document(uuid,text) from public,anon;
grant execute on function public.revoke_issued_document(uuid,text) to authenticated;
