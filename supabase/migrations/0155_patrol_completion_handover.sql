-- Require a concise, auditable handover before an assigned Tanod closes a shift.
drop function if exists public.complete_patrol_shift(uuid);

create function public.complete_patrol_shift(p_shift_id uuid, p_summary text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.patrol_shifts%rowtype;
  v_summary text := trim(coalesce(p_summary, ''));
begin
  select * into v_shift from public.patrol_shifts where id = p_shift_id for update;
  if not found or v_shift.assigned_to <> auth.uid()
     or not public.has_tenant_permission(v_shift.barangay_id, 'patrol.access') then
    raise exception 'not authorized';
  end if;
  if v_shift.status <> 'active' then
    raise exception 'only an active shift can be completed';
  end if;
  if length(v_summary) not between 10 and 1500 then
    raise exception 'provide a handover summary between 10 and 1500 characters';
  end if;

  update public.patrol_shifts
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = v_shift.id;

  insert into public.patrol_shift_logs(barangay_id, shift_id, actor_id, entry_type, details)
  values (v_shift.barangay_id, v_shift.id, auth.uid(), 'shift_completed', v_summary);
end;
$$;

revoke all on function public.complete_patrol_shift(uuid, text) from public, anon;
grant execute on function public.complete_patrol_shift(uuid, text) to authenticated;
