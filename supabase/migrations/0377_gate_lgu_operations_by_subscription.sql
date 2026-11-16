-- Require a current paid LGU month for municipal onboarding and incident work.
-- Subscription status and request RPCs intentionally remain available so an
-- unpaid or expired LGU can arrange payment and renew access.
create or replace function public.require_active_lgu_subscription(p_lgu_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_lgu_id is null or not exists (
    select 1 from public.lgu_memberships membership
    join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
    where membership.lgu_id = p_lgu_id and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  ) then
    raise exception 'active LGU administrator access is required';
  end if;
  if not exists (
    select 1 from public.lgu_subscriptions subscription
    join public.subscription_plans plan on plan.id = subscription.plan_id and plan.key = 'enterprise'
    where subscription.lgu_id = p_lgu_id and subscription.status = 'active'
      and subscription.period_ends_at > now()
  ) then
    raise exception 'an active monthly LGU subscription is required';
  end if;
end;
$$;
revoke all on function public.require_active_lgu_subscription(uuid) from public,anon,authenticated;

-- Preserve the existing implementation and tenant checks behind a wrapper that
-- first verifies the LGU's paid-through period.
do $$ begin
  if to_regprocedure('public.create_lgu_barangay_with_captain(text,text,text)') is not null
    and to_regprocedure('public.create_lgu_barangay_with_captain_unchecked(text,text,text)') is null then
    execute 'alter function public.create_lgu_barangay_with_captain(text,text,text) rename to create_lgu_barangay_with_captain_unchecked';
  end if;
end $$;
revoke all on function public.create_lgu_barangay_with_captain_unchecked(text,text,text) from public,anon,authenticated;
create or replace function public.create_lgu_barangay_with_captain(p_name text,p_code text,p_captain_email text)
returns table(created_barangay_id uuid,invitation_token text,expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  perform public.require_active_lgu_subscription(v_lgu_id);
  return query select * from public.create_lgu_barangay_with_captain_unchecked(p_name,p_code,p_captain_email);
end;
$$;
revoke all on function public.create_lgu_barangay_with_captain(text,text,text) from public,anon;
grant execute on function public.create_lgu_barangay_with_captain(text,text,text) to authenticated;

do $$ begin
  if to_regprocedure('public.create_lgu_captain_invitation(uuid,text)') is not null
    and to_regprocedure('public.create_lgu_captain_invitation_unchecked(uuid,text)') is null then
    execute 'alter function public.create_lgu_captain_invitation(uuid,text) rename to create_lgu_captain_invitation_unchecked';
  end if;
end $$;
revoke all on function public.create_lgu_captain_invitation_unchecked(uuid,text) from public,anon,authenticated;
create or replace function public.create_lgu_captain_invitation(p_barangay_id uuid,p_captain_email text)
returns table(invitation_token text,expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  select barangay.lgu_id into v_lgu_id from public.barangays barangay
  where barangay.id = p_barangay_id;
  perform public.require_active_lgu_subscription(v_lgu_id);
  return query select * from public.create_lgu_captain_invitation_unchecked(p_barangay_id,p_captain_email);
end;
$$;
revoke all on function public.create_lgu_captain_invitation(uuid,text) from public,anon;
grant execute on function public.create_lgu_captain_invitation(uuid,text) to authenticated;

-- Retire the older unpaginated read endpoint, which would otherwise bypass the
-- paid-month gate on the current searchable incident queue.
revoke all on function public.list_lgu_incident_escalations(text) from public,anon,authenticated;

do $$ begin
  if to_regprocedure('public.list_lgu_incident_escalations_page(text,integer,integer,text,text,date,date)') is not null
    and to_regprocedure('public.list_lgu_incident_escalations_page_unchecked(text,integer,integer,text,text,date,date)') is null then
    execute 'alter function public.list_lgu_incident_escalations_page(text,integer,integer,text,text,date,date) rename to list_lgu_incident_escalations_page_unchecked';
  end if;
end $$;
revoke all on function public.list_lgu_incident_escalations_page_unchecked(text,integer,integer,text,text,date,date) from public,anon,authenticated;
create or replace function public.list_lgu_incident_escalations_page(
  p_status text default 'all',p_page integer default 0,p_page_size integer default 25,
  p_search text default null,p_severity text default 'all',
  p_created_after date default null,p_created_before date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  perform public.require_active_lgu_subscription(v_lgu_id);
  return public.list_lgu_incident_escalations_page_unchecked(
    p_status,p_page,p_page_size,p_search,p_severity,p_created_after,p_created_before);
end;
$$;
revoke all on function public.list_lgu_incident_escalations_page(text,integer,integer,text,text,date,date) from public,anon;
grant execute on function public.list_lgu_incident_escalations_page(text,integer,integer,text,text,date,date) to authenticated;

do $$ begin
  if to_regprocedure('public.list_lgu_municipal_incident_reports(integer,integer,text,text,text,date,date)') is not null
    and to_regprocedure('public.list_lgu_municipal_incident_reports_unchecked(integer,integer,text,text,text,date,date)') is null then
    execute 'alter function public.list_lgu_municipal_incident_reports(integer,integer,text,text,text,date,date) rename to list_lgu_municipal_incident_reports_unchecked';
  end if;
end $$;
revoke all on function public.list_lgu_municipal_incident_reports_unchecked(integer,integer,text,text,text,date,date) from public,anon,authenticated;
create or replace function public.list_lgu_municipal_incident_reports(
  p_page integer default 0,p_page_size integer default 25,p_search text default null,
  p_status text default 'all',p_severity text default 'all',p_created_after date default null,p_created_before date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  perform public.require_active_lgu_subscription(v_lgu_id);
  return public.list_lgu_municipal_incident_reports_unchecked(
    p_page,p_page_size,p_search,p_status,p_severity,p_created_after,p_created_before);
end;
$$;
revoke all on function public.list_lgu_municipal_incident_reports(integer,integer,text,text,text,date,date) from public,anon;
grant execute on function public.list_lgu_municipal_incident_reports(integer,integer,text,text,text,date,date) to authenticated;

create or replace function public.list_lgu_incident_escalation_history(p_escalation_id uuid)
returns table(id uuid,action text,note text,actor_name text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  perform public.require_active_lgu_subscription(v_lgu_id);
  if v_lgu_id is null or not exists (
    select 1 from public.lgu_incident_escalations escalation
    where escalation.id = p_escalation_id and escalation.lgu_id = v_lgu_id
  ) then
    raise exception 'escalation history not found or not permitted';
  end if;
  return query select event.id,event.action,event.note,
    coalesce(nullif(profile.display_name,''),'Authorized administrator'),event.created_at
  from public.lgu_incident_escalation_events event
  left join public.profiles profile on profile.id = event.actor_id
  where event.escalation_id = p_escalation_id and event.lgu_id = v_lgu_id
  order by event.created_at,event.id;
end;
$$;
revoke all on function public.list_lgu_incident_escalation_history(uuid) from public,anon,authenticated;
grant execute on function public.list_lgu_incident_escalation_history(uuid) to authenticated;

do $$ begin
  if to_regprocedure('public.update_lgu_incident_escalation(uuid,text,text)') is not null
    and to_regprocedure('public.update_lgu_incident_escalation_unchecked(uuid,text,text)') is null then
    execute 'alter function public.update_lgu_incident_escalation(uuid,text,text) rename to update_lgu_incident_escalation_unchecked';
  end if;
end $$;
revoke all on function public.update_lgu_incident_escalation_unchecked(uuid,text,text) from public,anon,authenticated;
create or replace function public.update_lgu_incident_escalation(p_escalation_id uuid,p_status text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_lgu_id uuid;
begin
  select membership.lgu_id into v_lgu_id from public.lgu_memberships membership
  join public.local_government_units lgu on lgu.id = membership.lgu_id and lgu.status = 'active'
  where membership.user_id = (select auth.uid()) and membership.status = 'active'
  order by membership.created_at limit 1;
  perform public.require_active_lgu_subscription(v_lgu_id);
  perform public.update_lgu_incident_escalation_unchecked(p_escalation_id,p_status,p_note);
end;
$$;
revoke all on function public.update_lgu_incident_escalation(uuid,text,text) from public,anon;
grant execute on function public.update_lgu_incident_escalation(uuid,text,text) to authenticated;
