-- A declined referral may be closed by its origin after the decline reason is recorded.
-- Preserve both the decline path (no acknowledgment/response actor) and the
-- responded path (both acknowledgment and response actors are recorded).
do $$
declare v_constraint record;
begin
  -- Constraint names vary across databases because PostgreSQL generated them
  -- from unnamed CHECK clauses in migration 0027. Match the old state checks
  -- by their referenced columns instead of assuming generated names.
  for v_constraint in
    select c.conname
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.interbarangay_referrals'::regclass
      and c.contype = 'c'
      and (
        pg_catalog.pg_get_constraintdef(c.oid) ilike '%acknowledged_at%'
        or pg_catalog.pg_get_constraintdef(c.oid) ilike '%responded_at%'
        or pg_catalog.pg_get_constraintdef(c.oid) ilike '%status = ''declined''%'
      )
  loop
    execute pg_catalog.format('alter table public.interbarangay_referrals drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.interbarangay_referrals
  add constraint interbarangay_referrals_acknowledgment_state_check
    check ((status in ('submitted','declined') and acknowledged_at is null and acknowledged_by is null)
      or (status in ('acknowledged','responded') and acknowledged_at is not null and acknowledged_by is not null)
      or (status = 'closed' and ((acknowledged_at is not null and acknowledged_by is not null and responded_at is not null and responded_by is not null)
        or (acknowledged_at is null and acknowledged_by is null and responded_at is null and responded_by is null)))),
  add constraint interbarangay_referrals_response_state_check
    check ((status in ('submitted','acknowledged') and response is null and responded_at is null and responded_by is null)
      or (status = 'responded' and response is not null and responded_at is not null and responded_by is not null)
      or (status = 'declined' and response is not null and length(trim(response)) between 3 and 500 and responded_at is null and responded_by is null)
      or (status = 'closed' and response is not null and length(trim(response)) >= 3
        and ((responded_at is not null and responded_by is not null) or (responded_at is null and responded_by is null))));
