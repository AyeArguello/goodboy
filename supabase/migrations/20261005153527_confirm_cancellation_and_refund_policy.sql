-- Confirmed policy (2026-10-04): a client keeps the deposit only when the
-- appointment is rescheduled to another date in the same calendar month.
-- The existing reschedule RPC preserves the verified payment; cancelling a
-- confirmed appointment means no replacement slot was agreed and therefore
-- forfeits the deposit. Business-initiated cancellations never forfeit it.

create or replace function admin_cancel_appointment(
  p_appointment_id uuid,
  p_initiated_by text, -- 'client' | 'business'
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments%rowtype;
  v_new_status appointment_status;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_initiated_by not in ('client', 'business') then
    raise exception 'INVALID_ARGUMENT' using errcode = 'P0001';
  end if;

  select * into v_appt
  from appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_appt.status not in ('pending_review', 'awaiting_deposit', 'confirmed', 'reschedule_requested') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  if v_appt.status = 'confirmed' and p_initiated_by = 'client' then
    v_new_status := 'deposit_forfeited';
  else
    v_new_status := case p_initiated_by
      when 'client' then 'cancelled_by_client'
      else 'cancelled_by_business'
    end;
  end if;

  update appointments
  set status = v_new_status
  where id = p_appointment_id;

  insert into appointment_events (
    appointment_id,
    event_type,
    actor,
    admin_id,
    note
  ) values (
    p_appointment_id,
    (
      case
        when v_new_status = 'deposit_forfeited' then 'forfeited'
        else 'cancelled'
      end
    )::appointment_event_type,
    'admin',
    auth.uid(),
    p_note
  );
end;
$$;

revoke execute on function admin_cancel_appointment(uuid, text, text)
  from public, anon, service_role;
grant execute on function admin_cancel_appointment(uuid, text, text)
  to authenticated;
