-- Public verification requires both independent random values printed on a copy
-- of the issued document. The RPC deliberately omits resident identity/details.
create or replace function public.verify_public_issued_document(
  p_reference_number text,p_issuance_number text
) returns table (
  document_status text,document_type text,barangay_name text,issued_at timestamptz,expires_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select case
      when d.verification_status <> 'valid' then d.verification_status
      when d.expires_at is not null and d.expires_at <= now() then 'expired'
      else 'valid'
    end,
    t.name,b.name,d.issued_at,d.expires_at
  from public.issued_documents d
  join public.document_requests r on r.id = d.request_id and r.barangay_id = d.barangay_id
  join public.document_types t on t.id = r.document_type_id and t.barangay_id = r.barangay_id
  join public.barangays b on b.id = d.barangay_id
  where coalesce(p_reference_number,'') ~* '^[A-F0-9]{12}$'
    and coalesce(p_issuance_number,'') ~* '^[0-9]{4}-[A-F0-9]{8}$'
    and upper(r.reference_number) = upper(p_reference_number)
    and upper(d.issuance_number) = upper(p_issuance_number)
  limit 1;
$$;
revoke all on function public.verify_public_issued_document(text,text) from public;
grant execute on function public.verify_public_issued_document(text,text) to anon,authenticated;
