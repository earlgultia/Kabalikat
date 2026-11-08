-- Keep Kagawad due-date filters and request decisions aligned with the
-- Philippines calendar day, regardless of the database session timezone.
alter function public.list_kagawad_assigned_action_items(
  uuid, integer, integer, text, text, text
) set timezone = 'Asia/Manila';

alter function public.get_kagawad_action_item_summary(uuid)
  set timezone = 'Asia/Manila';

alter function public.request_committee_task_due_date(uuid, date, text)
  set timezone = 'Asia/Manila';

alter function public.decide_committee_task_due_date_request(uuid, text, text)
  set timezone = 'Asia/Manila';
