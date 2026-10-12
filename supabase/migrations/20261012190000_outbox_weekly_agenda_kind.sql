-- Allows the weekly owner digest (owner_weekly_agenda) in the email outbox.
alter table email_outbox drop constraint if exists email_outbox_kind_check;
alter table email_outbox add constraint email_outbox_kind_check check (kind in (
  'request_received', 'owner_new_request', 'request_approved',
  'receipt_received', 'owner_receipt_received', 'receipt_rejected',
  'appointment_confirmed', 'appointment_cancelled',
  'appointment_rescheduled', 'refund_recorded',
  'owner_weekly_agenda'
));
