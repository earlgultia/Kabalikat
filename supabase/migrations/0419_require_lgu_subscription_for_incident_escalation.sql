-- Do not create a municipal handoff when the receiving LGU cannot access its
-- incident queue because its monthly subscription is inactive.
do $$
begin
  if to_regprocedure('public.escalate_incident_to_lgu(uuid,text)') is not null
    and to_regprocedure('public.escalate_incident_to_lgu_unchecked(uuid,text)') is null then
    execute 'alter function public.escalate_incident_to_lgu(uuid,text) rename to escalate_incident_to_lgu_unchecked';
  end if;
end;
$$;

revoke all on function public.escalate_incident_to_lgu_unchecked(uuid, text)
  from public, anon, authenticated;

create or replace function public.escalate_incident_to_lgu(
  p_incident_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escalation_id uuid;
  v_lgu_id uuid;
begin
  -- The existing Captain and incident checks run in the original function.
  -- Any failure below rolls the whole operation back with no handoff record.
  v_escalation_id := public.escalate_incident_to_lgu_unchecked(
    p_incident_id,
    p_note
  );

  select escalation.lgu_id
    into v_lgu_id
  from public.lgu_incident_escalations as escalation
  where escalation.id = v_escalation_id;

  perform public.require_active_lgu_subscription(v_lgu_id);
  return v_escalation_id;
end;
$$;

revoke all on function public.escalate_incident_to_lgu(uuid, text)
  from public, anon;
grant execute on function public.escalate_incident_to_lgu(uuid, text)
  to authenticated;
