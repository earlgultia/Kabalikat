-- Emergency-contact erasure compares normalized phone digits. A normal phone
-- index cannot serve the regexp_replace predicate, so index only active
-- emergency-contact rows using the same normalization expression.
create index if not exists disaster_emergency_resources_emergency_phone_digits_idx
  on public.disaster_emergency_resources (
    (pg_catalog.regexp_replace(phone, '[^0-9]', '', 'g'))
  )
  where resource_type = 'emergency_contact'
    and phone is not null;
