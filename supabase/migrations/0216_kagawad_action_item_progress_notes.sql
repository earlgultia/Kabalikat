-- Let a Kagawad leave an auditable progress or blocker note on their own task.
create table public.committee_task_progress_notes (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null,
  committee_id uuid not null,
  task_id uuid not null references public.committee_tasks(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  note text not null,
  created_at timestamptz not null default now(),
  foreign key (committee_id, barangay_id) references public.committees(id, barangay_id) on delete restrict,
  check (length(trim(note)) between 3 and 2000)
);

create index committee_task_progress_notes_task_idx
  on public.committee_task_progress_notes(task_id, created_at desc, id desc);

alter table public.committee_task_progress_notes enable row level security;
revoke all on public.committee_task_progress_notes from public, anon, authenticated;

create or replace function public.list_kagawad_action_item_notes(p_task_id uuid)
returns table (
  id uuid,
  note text,
  author_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.committee_tasks task
    join public.committees committee
      on committee.id = task.committee_id
     and committee.barangay_id = task.barangay_id
    join public.barangay_memberships membership
      on membership.barangay_id = task.barangay_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    join public.role_definitions role on role.id = membership.role_id
    where task.id = p_task_id
      and task.assigned_to = (select auth.uid())
      and committee.status = 'active'
      and role.key = 'kagawad'
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select note_record.id, note_record.note,
    coalesce(nullif(profile.display_name, ''), 'You')::text as author_name,
    note_record.created_at
  from public.committee_task_progress_notes note_record
  left join public.profiles profile on profile.id = note_record.author_id
  where note_record.task_id = p_task_id
    and note_record.author_id = (select auth.uid())
  order by note_record.created_at desc, note_record.id desc
  limit 50;
end;
$$;

create or replace function public.add_kagawad_action_item_note(p_task_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.committee_tasks%rowtype;
  v_note_id uuid;
  v_note text := trim(coalesce(p_note, ''));
begin
  select task.* into v_task
  from public.committee_tasks task
  join public.committees committee
    on committee.id = task.committee_id
   and committee.barangay_id = task.barangay_id
  join public.barangay_memberships membership
    on membership.barangay_id = task.barangay_id
   and membership.user_id = (select auth.uid())
   and membership.status = 'active'
  join public.role_definitions role on role.id = membership.role_id
  where task.id = p_task_id
    and task.assigned_to = (select auth.uid())
    and committee.status = 'active'
    and role.key = 'kagawad'
  for update of task;

  if not found then raise exception 'not authorized'; end if;
  if length(v_note) not between 3 and 2000 then raise exception 'note must be between 3 and 2000 characters'; end if;

  insert into public.committee_task_progress_notes(barangay_id, committee_id, task_id, author_id, note)
  values (v_task.barangay_id, v_task.committee_id, v_task.id, (select auth.uid()), v_note)
  returning id into v_note_id;

  return v_note_id;
end;
$$;

revoke all on function public.list_kagawad_action_item_notes(uuid) from public, anon;
revoke all on function public.add_kagawad_action_item_note(uuid, text) from public, anon;
grant execute on function public.list_kagawad_action_item_notes(uuid) to authenticated;
grant execute on function public.add_kagawad_action_item_note(uuid, text) to authenticated;
