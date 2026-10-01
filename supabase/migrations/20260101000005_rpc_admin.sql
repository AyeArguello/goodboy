-- Admin RPCs. All check is_admin() themselves (defense in depth on top of
-- the `authenticated`-only grant + RLS policies), and all write
-- appointment_events for a full audit trail.

-- Moves a lock-acquired, still-current row from pending_review into
-- awaiting_deposit, opening a fresh deposit_due_hours window. Re-approving
-- an already-expired request (see expire_overdue_deposits()) is also how an
-- admin revives it for a client who shows up late, as long as the slot is
-- still free.
create or replace function admin_approve_request(p_appointment_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_settings business_settings%rowtype;
  v_appt appointments%rowtype;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_settings from business_settings where id = true;
  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_appt.status not in ('pending_review', 'expired') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  update appointments
  set status = 'awaiting_deposit',
      deposit_due_at = now() + make_interval(hours => v_settings.deposit_due_hours)
  where id = p_appointment_id;

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (p_appointment_id, 'approved', 'admin', auth.uid(), p_note);
end;
$$;
grant execute on function admin_approve_request(uuid, text) to authenticated;

create or replace function admin_reject_request(p_appointment_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments%rowtype;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_appt.status <> 'pending_review' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  update appointments set status = 'cancelled_by_business' where id = p_appointment_id;

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (p_appointment_id, 'rejected', 'admin', auth.uid(), p_note);
end;
$$;
grant execute on function admin_reject_request(uuid, text) to authenticated;

-- Records a verified deposit payment and confirms the appointment. Refuses
-- a request whose deposit window already lapsed — re-approve it first
-- (admin_approve_request), which re-opens a fresh window.
create or replace function admin_record_deposit_payment(
  p_appointment_id uuid,
  p_amount_ars numeric,
  p_method payment_method,
  p_external_reference text default null,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments%rowtype;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_appt.status <> 'awaiting_deposit' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if v_appt.deposit_due_at is not null and v_appt.deposit_due_at < now() then
    raise exception 'DEPOSIT_WINDOW_EXPIRED' using errcode = 'P0001';
  end if;

  insert into payments (appointment_id, amount_ars, method, status, external_reference, verified_by, note)
  values (p_appointment_id, p_amount_ars, p_method, 'verified', p_external_reference, auth.uid(), p_note);

  update appointments set status = 'confirmed' where id = p_appointment_id;

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (p_appointment_id, 'deposit_recorded', 'admin', auth.uid(), p_note);
end;
$$;
grant execute on function admin_record_deposit_payment(uuid, numeric, payment_method, text, text) to authenticated;

-- Undoes a mistaken deposit entry: marks the payment reversed and reopens a
-- fresh deposit window instead of losing the reservation outright.
create or replace function admin_reverse_deposit_payment(p_appointment_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments%rowtype;
  v_settings business_settings%rowtype;
  v_payment_id uuid;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_appt.status <> 'confirmed' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  select id into v_payment_id from payments
  where appointment_id = p_appointment_id and status = 'verified'
  order by verified_at desc limit 1;
  if v_payment_id is null then
    raise exception 'NO_VERIFIED_PAYMENT' using errcode = 'P0001';
  end if;

  update payments set status = 'reversed' where id = v_payment_id;

  select * into v_settings from business_settings where id = true;
  update appointments
  set status = 'awaiting_deposit',
      deposit_due_at = now() + make_interval(hours => v_settings.deposit_due_hours)
  where id = p_appointment_id;

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (p_appointment_id, 'deposit_reversed', 'admin', auth.uid(), p_note);
end;
$$;
grant execute on function admin_reverse_deposit_payment(uuid, text) to authenticated;

-- Cancellation with the confirmed 48h-forfeiture rule: cancelling a
-- *confirmed* (deposit already paid) appointment less than
-- cancellation_cutoff_hours before its slot forfeits the deposit instead of
-- a plain cancelled_by_* status. Cancelling anything not yet confirmed never
-- forfeits anything (no deposit was taken).
create or replace function admin_cancel_appointment(
  p_appointment_id uuid,
  p_initiated_by text, -- 'client' | 'business'
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments%rowtype;
  v_slot availability_slots%rowtype;
  v_settings business_settings%rowtype;
  v_new_status appointment_status;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_initiated_by not in ('client', 'business') then
    raise exception 'INVALID_ARGUMENT' using errcode = 'P0001';
  end if;

  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_appt.status not in ('pending_review', 'awaiting_deposit', 'confirmed', 'reschedule_requested') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  if v_appt.status = 'confirmed' then
    select * into v_slot from availability_slots where id = v_appt.slot_id;
    select * into v_settings from business_settings where id = true;
    if v_slot.starts_at - make_interval(hours => v_settings.cancellation_cutoff_hours) < now() then
      v_new_status := 'deposit_forfeited';
    else
      v_new_status := case p_initiated_by when 'client' then 'cancelled_by_client' else 'cancelled_by_business' end;
    end if;
  else
    v_new_status := case p_initiated_by when 'client' then 'cancelled_by_client' else 'cancelled_by_business' end;
  end if;

  update appointments set status = v_new_status where id = p_appointment_id;

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (
    p_appointment_id,
    case when v_new_status = 'deposit_forfeited' then 'forfeited' else 'cancelled' end,
    'admin', auth.uid(), p_note
  );
end;
$$;
grant execute on function admin_cancel_appointment(uuid, text, text) to authenticated;

-- Simple terminal/lateral transitions that never touch money: complete,
-- no-show, or move a confirmed appointment to a new slot in one step.
create or replace function admin_set_appointment_status(
  p_appointment_id uuid,
  p_new_status appointment_status,
  p_new_slot_id uuid default null,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments%rowtype;
  v_old_slot_id uuid;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_new_status not in ('completed', 'no_show', 'reschedule_requested', 'confirmed') then
    raise exception 'UNSUPPORTED_STATUS' using errcode = 'P0001';
  end if;

  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_old_slot_id := v_appt.slot_id;

  if p_new_status = 'reschedule_requested' then
    if v_appt.status <> 'confirmed' then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;
    if p_new_slot_id is null then
      raise exception 'NEW_SLOT_REQUIRED' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from appointments
      where slot_id = p_new_slot_id
        and status in ('pending_review', 'confirmed', 'reschedule_requested')
        and id <> p_appointment_id
    ) then
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
    end if;
    -- Reassign and land back on `confirmed` in one step — the deposit already
    -- paid still covers the new slot; no second payment is asked for a
    -- straightforward reschedule.
    update appointments set status = 'confirmed', slot_id = p_new_slot_id where id = p_appointment_id;
    insert into appointment_events (appointment_id, event_type, actor, admin_id, from_slot_id, to_slot_id, note)
    values (p_appointment_id, 'rescheduled', 'admin', auth.uid(), v_old_slot_id, p_new_slot_id, p_note);
    return;
  end if;

  -- `confirmed` is only reachable here as the undo path for a just-completed
  -- or just-no-showed appointment (the "Deshacer" toast) — never a forward
  -- transition (that's what the deposit RPCs are for).
  if p_new_status = 'confirmed' then
    if v_appt.status not in ('completed', 'no_show') then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;
  elsif v_appt.status <> 'confirmed' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  update appointments set status = p_new_status where id = p_appointment_id;
  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (
    p_appointment_id,
    case p_new_status
      when 'completed' then 'completed'
      when 'no_show' then 'no_show'
      else 'reverted' -- undo path: back to confirmed from completed/no_show
    end::appointment_event_type,
    'admin', auth.uid(), p_note
  );
end;
$$;
grant execute on function admin_set_appointment_status(uuid, appointment_status, uuid, text) to authenticated;

-- Separate from client-visible `notes` (dog temperament etc.) — never shown
-- to the customer, matching "notas internas separadas de notas del cliente".
create or replace function admin_set_internal_notes(p_appointment_id uuid, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  update appointments set admin_notes = p_notes where id = p_appointment_id;
end;
$$;
grant execute on function admin_set_internal_notes(uuid, text) to authenticated;

-- Sweeps every awaiting_deposit row whose window lapsed into `expired`,
-- freeing the slot for real (not just lazily, in read queries). Cheap and
-- idempotent — the admin app calls this on every Hoy/Solicitudes/Agenda
-- load instead of requiring pg_cron to be configured.
create or replace function expire_overdue_deposits() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  with expired as (
    update appointments
    set status = 'expired'
    where status = 'awaiting_deposit' and deposit_due_at < now()
    returning id
  )
  insert into appointment_events (appointment_id, event_type, actor)
  select id, 'expired', 'system' from expired;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function expire_overdue_deposits() to authenticated;

-- Creates (or re-publishes) a slot at the given time. Enforces the hard
-- 3-per-day cap; returns a GAP_WARNING instead of publishing when another
-- published slot the same day is within warn_gap_minutes, unless p_force
-- (the approved 09:00/11:30/13:30 grid deliberately has a 120 min gap
-- between its last two starts, which must warn but never block).
create or replace function admin_publish_slot(p_starts_at timestamptz, p_force boolean default false)
returns table (slot_id uuid, warning text)
language plpgsql security definer set search_path = public as $$
declare
  v_settings business_settings%rowtype;
  v_date date;
  v_published_count int;
  v_nearest_gap_minutes numeric;
  v_slot_id uuid;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_settings from business_settings where id = true;
  v_date := (p_starts_at at time zone v_settings.timezone)::date;

  select count(*) into v_published_count
  from availability_slots s
  where (s.starts_at at time zone v_settings.timezone)::date = v_date
    and s.is_published = true;

  if v_published_count >= v_settings.max_active_per_day then
    raise exception 'DAY_FULL' using errcode = 'P0001';
  end if;

  select min(extract(epoch from abs(s.starts_at - p_starts_at)) / 60) into v_nearest_gap_minutes
  from availability_slots s
  where (s.starts_at at time zone v_settings.timezone)::date = v_date
    and s.is_published = true;

  if v_nearest_gap_minutes is not null and v_nearest_gap_minutes < v_settings.warn_gap_minutes and not p_force then
    return query select null::uuid, 'GAP_WARNING'::text;
    return;
  end if;

  insert into availability_slots (starts_at, is_published, created_by)
  values (p_starts_at, true, auth.uid())
  on conflict (starts_at) do update set is_published = true
  returning id into v_slot_id;

  return query select v_slot_id, null::text;
end;
$$;
grant execute on function admin_publish_slot(timestamptz, boolean) to authenticated;

-- Toggles an existing slot's visibility. Turning it on re-checks the same
-- day cap as admin_publish_slot; turning it off is always allowed as long
-- as nothing is currently occupying it.
create or replace function admin_set_slot_visibility(p_slot_id uuid, p_visible boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_settings business_settings%rowtype;
  v_slot availability_slots%rowtype;
  v_date date;
  v_published_count int;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_slot from availability_slots where id = p_slot_id for update;
  if not found then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not p_visible then
    if exists (
      select 1 from appointments
      where slot_id = p_slot_id
        and status in ('pending_review', 'awaiting_deposit', 'confirmed', 'reschedule_requested')
    ) then
      raise exception 'SLOT_HAS_APPOINTMENT' using errcode = 'P0001';
    end if;
    update availability_slots set is_published = false where id = p_slot_id;
    return;
  end if;

  select * into v_settings from business_settings where id = true;
  v_date := (v_slot.starts_at at time zone v_settings.timezone)::date;

  select count(*) into v_published_count
  from availability_slots s
  where (s.starts_at at time zone v_settings.timezone)::date = v_date
    and s.is_published = true
    and s.id <> p_slot_id;

  if v_published_count >= v_settings.max_active_per_day then
    raise exception 'DAY_FULL' using errcode = 'P0001';
  end if;

  update availability_slots set is_published = true where id = p_slot_id;
end;
$$;
grant execute on function admin_set_slot_visibility(uuid, boolean) to authenticated;

create or replace function admin_block_date(p_date date, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  insert into blocked_dates (blocked_date, reason, created_by)
  values (p_date, p_reason, auth.uid())
  on conflict (blocked_date) do update set reason = excluded.reason;
end;
$$;
grant execute on function admin_block_date(date, text) to authenticated;

-- Postgres grants EXECUTE to PUBLIC by default on function creation; revoke
-- it explicitly so `anon` has no path to these even before is_admin() runs.
revoke execute on function admin_approve_request(uuid, text) from public;
revoke execute on function admin_reject_request(uuid, text) from public;
revoke execute on function admin_record_deposit_payment(uuid, numeric, payment_method, text, text) from public;
revoke execute on function admin_reverse_deposit_payment(uuid, text) from public;
revoke execute on function admin_cancel_appointment(uuid, text, text) from public;
revoke execute on function admin_set_appointment_status(uuid, appointment_status, uuid, text) from public;
revoke execute on function admin_set_internal_notes(uuid, text) from public;
revoke execute on function expire_overdue_deposits() from public;
revoke execute on function admin_publish_slot(timestamptz, boolean) from public;
revoke execute on function admin_set_slot_visibility(uuid, boolean) from public;
revoke execute on function admin_block_date(date, text) from public;
