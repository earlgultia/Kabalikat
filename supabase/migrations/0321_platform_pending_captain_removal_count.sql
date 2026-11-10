-- Surface staged Captain removals that still need Auth cleanup or audit completion.
create or replace function public.get_platform_pending_captain_removal_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  return (
    select count(*)
    from public.platform_account_removal_events removal
    where removal.completed_at is null
  );
end;
$$;

revoke all on function public.get_platform_pending_captain_removal_count() from public, anon;
grant execute on function public.get_platform_pending_captain_removal_count() to authenticated;
