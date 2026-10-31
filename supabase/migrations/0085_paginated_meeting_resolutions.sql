-- Support stable paging through large meeting resolution histories.
create index if not exists meeting_resolutions_meeting_page_idx
  on public.meeting_resolutions(meeting_id, created_at desc, id desc);
