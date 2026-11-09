-- The application now reads project replies through the paginated RPC,
-- which applies the active membership and plan entitlement checks. Revoke
-- the original unbounded endpoint so it cannot bypass those controls.
revoke all on function public.list_barangay_project_update_responses(uuid)
  from public, anon, authenticated;
