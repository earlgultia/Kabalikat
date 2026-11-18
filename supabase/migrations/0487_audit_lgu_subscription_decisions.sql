-- Record LGU subscription approvals and declines in the existing platform
-- activity history without copying payment confirmation or decline notes.
create or replace function public.record_lgu_subscription_request_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_municipality text;
  v_province text;
begin
  if old.status is not distinct from new.status
    or new.status not in ('activated', 'declined')
    or new.reviewed_by is null then
    return new;
  end if;

  select lgu.municipality, lgu.province
  into v_municipality, v_province
  from public.local_government_units as lgu
  where lgu.id = new.lgu_id;

  insert into public.platform_activity_events(actor_id, barangay_id, event_type, summary)
  values (
    new.reviewed_by,
    null,
    'subscription_updated',
    format(
      'LGU monthly subscription request %s for %s, %s',
      new.status,
      coalesce(nullif(v_municipality, ''), 'municipality'),
      coalesce(nullif(v_province, ''), 'province')
    )
  );

  return new;
end;
$$;

revoke all on function public.record_lgu_subscription_request_decision() from public, anon, authenticated;

drop trigger if exists lgu_subscription_request_decision_activity on public.lgu_subscription_plan_requests;
create trigger lgu_subscription_request_decision_activity
  after update of status on public.lgu_subscription_plan_requests
  for each row execute function public.record_lgu_subscription_request_decision();
