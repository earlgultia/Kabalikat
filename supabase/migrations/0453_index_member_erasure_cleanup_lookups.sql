-- Account erasure deletes household links by resident_id and invitation
-- responses by user_id. Existing primary keys start with other columns, so
-- these lookups need dedicated indexes as histories grow.
create index if not exists household_members_resident_erasure_idx
  on public.household_members (resident_id);

create index if not exists meeting_invitation_responses_user_erasure_idx
  on public.meeting_invitation_responses (user_id);
