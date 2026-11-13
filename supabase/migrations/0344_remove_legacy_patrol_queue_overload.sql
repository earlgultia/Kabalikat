-- The assignee-filtered RPC has a defaulted sixth parameter. Keeping the old
-- five-argument overload makes calls that omit p_assigned_to ambiguous.
drop function if exists public.list_patrol_shifts_filtered_page(
  uuid, integer, integer, text, text
);
