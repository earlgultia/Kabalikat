-- Support the account-erasure lookups added for resolved advisories and
-- patrol cancellation history without scanning tenant-wide operational logs.
create index if not exists disaster_advisories_resolver_idx
  on public.disaster_advisories (resolved_by) where resolved_by is not null;

create index if not exists patrol_shift_cancelled_actor_shift_idx
  on public.patrol_shift_logs (actor_id, shift_id)
  where entry_type = 'shift_cancelled';
