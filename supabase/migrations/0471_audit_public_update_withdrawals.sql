-- Retain who withdrew a public post for internal history without exposing
-- staff identifiers in the member-facing feed.
alter table public.barangay_official_public_updates
  add column withdrawn_by uuid references public.profiles(id) on delete set null;

alter table public.barangay_finance_public_updates
  add column withdrawn_by uuid references public.profiles(id) on delete set null;

create or replace function public.record_public_update_withdrawal_actor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.withdrawn_at is null and new.withdrawn_at is not null then
    if auth.uid() is null then
      raise exception 'withdrawal must be performed through an authenticated workflow';
    end if;
    new.withdrawn_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.record_public_update_withdrawal_actor() from public, anon, authenticated;

create trigger barangay_official_public_updates_record_withdrawer
  before update of withdrawn_at on public.barangay_official_public_updates
  for each row execute function public.record_public_update_withdrawal_actor();

create trigger barangay_finance_public_updates_record_withdrawer
  before update of withdrawn_at on public.barangay_finance_public_updates
  for each row execute function public.record_public_update_withdrawal_actor();
