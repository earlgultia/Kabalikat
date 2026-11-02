-- Record which plan metadata fields changed without copying their values.
create or replace function public.update_platform_subscription_plan(
  p_plan_id uuid,
  p_name text,
  p_description text,
  p_entitlements jsonb,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_entitlement record;
  v_changed_fields text[] := array[]::text[];
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;
  if p_plan_id is null
    or length(trim(coalesce(p_name, ''))) not between 2 and 100
    or p_description is null
    or length(p_description) > 1000
    or p_active is null
    or p_entitlements is null
    or jsonb_typeof(p_entitlements) <> 'object'
    or (select count(*) from jsonb_object_keys(p_entitlements)) > 30 then
    raise exception 'invalid subscription plan details';
  end if;

  for v_entitlement in select key, value from jsonb_each(p_entitlements)
  loop
    if v_entitlement.key !~ '^[a-z][a-z0-9_]{1,59}$'
      or jsonb_typeof(v_entitlement.value) <> 'boolean' then
      raise exception 'entitlement keys must be valid and values must be boolean';
    end if;
  end loop;

  select * into v_plan
  from public.subscription_plans
  where id = p_plan_id
  for update;
  if not found then
    raise exception 'subscription plan not found';
  end if;
  if v_plan.key = 'free' and not p_active then
    raise exception 'the Free plan must remain available';
  end if;

  if v_plan.name is distinct from trim(p_name) then
    v_changed_fields := array_append(v_changed_fields, 'name');
  end if;
  if v_plan.description is distinct from trim(p_description) then
    v_changed_fields := array_append(v_changed_fields, 'description');
  end if;
  if v_plan.entitlements is distinct from p_entitlements then
    v_changed_fields := array_append(v_changed_fields, 'entitlements');
  end if;
  if v_plan.active is distinct from p_active then
    v_changed_fields := array_append(v_changed_fields, 'availability');
  end if;

  if cardinality(v_changed_fields) = 0 then
    return;
  end if;

  update public.subscription_plans
  set name = trim(p_name), description = trim(p_description),
      entitlements = p_entitlements, active = p_active, updated_at = now()
  where id = v_plan.id;

  insert into public.platform_activity_events(actor_id, barangay_id, event_type, summary)
  values (
    auth.uid(), null, 'subscription_plan_updated',
    format('Plan %s metadata fields changed: %s', v_plan.key, array_to_string(v_changed_fields, ', '))
  );
end;
$$;

revoke all on function public.update_platform_subscription_plan(uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.update_platform_subscription_plan(uuid, text, text, jsonb, boolean) to authenticated;
