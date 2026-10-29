-- Phase 4: private receipt attachments tied to financial transactions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('financial-receipts', 'financial-receipts', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png'];

create table public.financial_receipt_upload_intents (
  id uuid primary key,
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  transaction_id uuid not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  storage_path text not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  foreign key (transaction_id, barangay_id) references public.financial_transactions(id, barangay_id) on delete restrict,
  check (length(trim(file_name)) between 1 and 180),
  check (mime_type in ('application/pdf','image/jpeg','image/png')),
  check (file_size between 1 and 10485760)
);

create table public.financial_receipts (
  id uuid primary key,
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  transaction_id uuid not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  storage_path text not null unique,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (transaction_id, barangay_id) references public.financial_transactions(id, barangay_id) on delete restrict,
  unique (id, barangay_id),
  check (length(trim(file_name)) between 1 and 180),
  check (mime_type in ('application/pdf','image/jpeg','image/png')),
  check (file_size between 1 and 10485760),
  check (storage_path = barangay_id::text || '/' || transaction_id::text || '/' || id::text || '/' || file_name)
);
create index financial_receipts_transaction_idx on public.financial_receipts(transaction_id, created_at desc);

alter table public.financial_events drop constraint financial_events_action_check;
alter table public.financial_events add constraint financial_events_action_check
  check (action in ('budget_submitted','budget_approved','transaction_submitted','transaction_posted','transaction_rejected','transaction_voided','receipt_attached'));

create or replace function public.create_financial_receipt_upload_intent(
  p_transaction_id uuid, p_receipt_id uuid, p_file_name text, p_mime_type text, p_file_size bigint
)
returns text language plpgsql security definer
set search_path = ''
as $$
declare v_transaction public.financial_transactions%rowtype; v_storage_path text;
begin
  select * into v_transaction from public.financial_transactions where id = p_transaction_id;
  if not found or not public.has_tenant_permission(v_transaction.barangay_id, 'finance.manage') then raise exception 'not authorized'; end if;
  if v_transaction.status not in ('submitted','posted') then raise exception 'receipts cannot be attached to this transaction'; end if;
  if length(trim(coalesce(p_file_name,''))) not between 1 and 180
    or position('/' in p_file_name) > 0 or position(chr(92) in p_file_name) > 0
    or p_mime_type is null or p_mime_type not in ('application/pdf','image/jpeg','image/png')
    or p_file_size is null or p_file_size not between 1 and 10485760 then raise exception 'invalid receipt file details'; end if;
  v_storage_path := v_transaction.barangay_id::text || '/' || v_transaction.id::text || '/' || p_receipt_id::text || '/' || trim(p_file_name);
  insert into public.financial_receipt_upload_intents(
    id, barangay_id, transaction_id, file_name, mime_type, file_size, storage_path, created_by, expires_at
  ) values (
    p_receipt_id, v_transaction.barangay_id, v_transaction.id, trim(p_file_name), p_mime_type, p_file_size,
    v_storage_path, auth.uid(), now() + interval '20 minutes'
  );
  return v_storage_path;
end;
$$;

create or replace function public.register_financial_receipt(p_receipt_id uuid)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_intent public.financial_receipt_upload_intents%rowtype; v_transaction public.financial_transactions%rowtype; v_object_mime text; v_object_size bigint;
begin
  select * into v_intent from public.financial_receipt_upload_intents where id = p_receipt_id and created_by = auth.uid() for update;
  if not found or v_intent.expires_at <= now()
    or not public.has_tenant_permission(v_intent.barangay_id, 'finance.manage') then raise exception 'receipt upload authorization expired'; end if;
  select * into v_transaction from public.financial_transactions where id = v_intent.transaction_id for update;
  if v_transaction.status not in ('submitted','posted') then raise exception 'receipt cannot be attached to this transaction'; end if;
  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint into v_object_mime, v_object_size
  from storage.objects o where o.bucket_id = 'financial-receipts' and o.name = v_intent.storage_path;
  if not found or v_object_mime is distinct from v_intent.mime_type or v_object_size is distinct from v_intent.file_size then
    raise exception 'uploaded receipt not found or does not match its upload authorization';
  end if;
  insert into public.financial_receipts(id, barangay_id, transaction_id, file_name, mime_type, file_size, storage_path, uploaded_by)
  values (v_intent.id, v_intent.barangay_id, v_intent.transaction_id, v_intent.file_name, v_intent.mime_type, v_intent.file_size, v_intent.storage_path, auth.uid());
  insert into public.financial_events(barangay_id, transaction_id, actor_id, action, to_status)
  values (v_intent.barangay_id, v_intent.transaction_id, auth.uid(), 'receipt_attached', v_transaction.status);
  delete from public.financial_receipt_upload_intents where id = v_intent.id;
  return v_intent.id;
end;
$$;

alter table public.financial_receipts enable row level security;
alter table public.financial_receipt_upload_intents enable row level security;
create policy financial_receipts_read on public.financial_receipts for select to authenticated
  using (public.has_tenant_permission(barangay_id, 'finance.read'));
create policy financial_receipt_upload_intents_read_own on public.financial_receipt_upload_intents for select to authenticated
  using (created_by = (select auth.uid()) and public.has_tenant_permission(barangay_id, 'finance.manage'));

create policy financial_receipt_storage_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'financial-receipts' and exists (
    select 1 from public.financial_receipt_upload_intents i where i.storage_path = name
      and i.created_by = (select auth.uid()) and i.expires_at > now()
      and public.has_tenant_permission(i.barangay_id, 'finance.manage')
  ));
create policy financial_receipt_storage_download on storage.objects for select to authenticated
  using (bucket_id = 'financial-receipts' and exists (
    select 1 from public.financial_receipts r where r.storage_path = name
      and public.has_tenant_permission(r.barangay_id, 'finance.read')
  ));

revoke all on public.financial_receipts, public.financial_receipt_upload_intents from anon, authenticated;
grant select on public.financial_receipts, public.financial_receipt_upload_intents to authenticated;
revoke all on function public.create_financial_receipt_upload_intent(uuid,uuid,text,text,bigint) from public, anon;
revoke all on function public.register_financial_receipt(uuid) from public, anon;
grant execute on function public.create_financial_receipt_upload_intent(uuid,uuid,text,text,bigint) to authenticated;
grant execute on function public.register_financial_receipt(uuid) to authenticated;
