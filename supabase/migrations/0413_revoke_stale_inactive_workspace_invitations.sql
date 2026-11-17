-- Clean up pending links that predate the workspace-status revocation triggers.
-- Their status updates are captured by the existing invitation audit trigger.
update public.invitations as invitation
set status = 'revoked'
from public.barangays as barangay
left join public.local_government_units as lgu on lgu.id = barangay.lgu_id
where invitation.barangay_id = barangay.id
  and invitation.status = 'pending'
  and (
    barangay.status is distinct from 'active'
    or (barangay.lgu_id is not null and lgu.status is distinct from 'active')
  );
