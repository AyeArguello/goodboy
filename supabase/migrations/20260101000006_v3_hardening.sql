-- v3 hardening pass — closes the P0 items from
-- docs/auditoria-seguridad-y-cumplimiento-good-boy.md and implements the
-- Saturday-vs-weekday schedule from docs/plan-web-good-boy.md §2. Nothing
-- here edits an already-applied migration file; everything is
-- `create or replace function` / `alter table` on top of the v2 schema.

-- ---------------------------------------------------------------------
-- 1. Day-of-week-aware schedule helpers (mirrors lib/domain/schedule.ts).
--    Mon-Fri (isodow 1-5): 09:00/11:30/13:30, max 3 active/day.
--    Saturday (isodow 6): 11:00 only, max 1 active/day.
--    Sunday (isodow 7): closed — no slot time is allowed, max 0.
-- ---------------------------------------------------------------------
-- `stable`, not `immutable`: AT TIME ZONE depends on the server's loaded
-- tzdata rules, which Postgres itself only classifies as stable, not
-- immutable (even though Argentina has used a fixed UTC-3 offset since 2009).
create or replace function is_allowed_slot_time(p_starts_at timestamptz, p_timezone text)
returns boolean
language sql stable as $$
  select case extract(isodow from (p_starts_at at time zone p_timezone))::int
    when 6 then to_char(p_starts_at at time zone p_timezone, 'HH24:MI') = '11:00'
    when 7 then false
    else to_char(p_starts_at at time zone p_timezone, 'HH24:MI') in ('09:00', '11:30', '13:30')
  end;
$$;

create or replace function max_active_per_day_for(p_starts_at timestamptz, p_timezone text)
returns int
language sql stable as $$
  select case extract(isodow from (p_starts_at at time zone p_timezone))::int
    when 6 then 1
    when 7 then 0
    else 3
  end;
$$;

-- Defense in depth: `availability_slots_admin_all` (RLS) lets an authenticated
-- admin write this table directly, bypassing admin_publish_slot entirely.
-- This trigger makes the schedule rule unconditional, matching the
-- auditoría's "incluso si se invocan directamente".
create or replace function enforce_slot_schedule() returns trigger
language plpgsql set search_path = public as $$
declare
  v_timezone text;
begin
  select timezone into v_timezone from business_settings where id = true;
  if not is_allowed_slot_time(new.starts_at, v_timezone) then
    raise exception 'INVALID_TIME' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger availability_slots_schedule_guard
  before insert or update of starts_at on availability_slots
  for each row execute function enforce_slot_schedule();

-- ---------------------------------------------------------------------
-- 2. Cancellation bug fix: forfeiture only ever applies to a
--    *client*-initiated cancellation. A business-initiated cancellation of a
--    confirmed appointment inside the cutoff must never forfeit the deposit
--    (auditoría hallazgo #4 / "bug crítico de cancelación").
-- ---------------------------------------------------------------------
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

  if v_appt.status = 'confirmed' and p_initiated_by = 'client' then
    select * into v_slot from availability_slots where id = v_appt.slot_id;
    select * into v_settings from business_settings where id = true;
    if v_slot.starts_at - make_interval(hours => v_settings.cancellation_cutoff_hours) < now() then
      v_new_status := 'deposit_forfeited';
    else
      v_new_status := 'cancelled_by_client';
    end if;
  else
    -- Business-initiated cancellations never forfeit, confirmed or not —
    -- only the client's own late cancellation does.
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
revoke execute on function admin_cancel_appointment(uuid, text, text) from public;

-- ---------------------------------------------------------------------
-- 3. request_appointment: schedule check, per-day cap by day-of-week, an
--    inline lazy-expiration sweep (so a just-expired row's slot is truly
--    free before the unique index is tested — see auditoría hallazgo sobre
--    "expiración perezosa"), input validation, and an 8-character
--    cryptographically-generated code (was 4 chars via random()).
-- ---------------------------------------------------------------------
create or replace function request_appointment(
  p_slot_id uuid,
  p_dog_name text,
  p_size_bucket size_bucket,
  p_breed text,
  p_coat_state coat_state,
  p_service_package service_package,
  p_notes text,
  p_logistics_mode logistics_mode,
  p_neighborhood text,
  p_pickup_address text,
  p_owner_name text,
  p_phone_e164 text,
  p_email text,
  p_consents jsonb,
  p_client_key text default 'unknown'
) returns table (code text, appointment_id uuid, slot_starts_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_slot availability_slots%rowtype;
  v_settings business_settings%rowtype;
  v_date date;
  v_active_count int;
  v_code text;
  v_appointment_id uuid;
  v_attempts int := 0;
  v_required_consents text[] := array['orientative_price', 'deposit_and_cancellation', 'privacy'];
  v_consent_count int;
begin
  perform enforce_rate_limit('booking:' || p_client_key, 5, interval '10 minutes');

  -- Lazy-expiration sweep so a lapsed awaiting_deposit row can never block a
  -- genuinely free slot behind the unique index below.
  with expired as (
    update appointments
    set status = 'expired'
    where status = 'awaiting_deposit' and deposit_due_at < now()
    returning id
  )
  insert into appointment_events (appointment_id, event_type, actor)
  select id, 'expired', 'system' from expired;

  -- Input validation (defense in depth — Zod validates in the app layer, but
  -- this RPC is reachable directly with a valid anon key).
  if p_dog_name is null or char_length(trim(p_dog_name)) = 0 or char_length(p_dog_name) > 80 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if p_owner_name is null or char_length(trim(p_owner_name)) = 0 or char_length(p_owner_name) > 80 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if p_breed is not null and char_length(p_breed) > 100 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if p_neighborhood is not null and char_length(p_neighborhood) > 100 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if p_pickup_address is not null and char_length(p_pickup_address) > 200 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if p_email is not null and p_email <> '' and (
    char_length(p_email) > 254 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ) then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if p_phone_e164 !~ '^\+\d{10,15}$' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if p_logistics_mode = 'pickup' and (p_neighborhood is null or p_pickup_address is null) then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  -- Every required consent key must be present with a positive integer
  -- version and a non-empty accepted_at — never an empty/partial array.
  if jsonb_typeof(p_consents) is distinct from 'array' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  select count(*) into v_consent_count
  from jsonb_array_elements(p_consents) e
  where e ->> 'key' = any (v_required_consents)
    and coalesce(e ->> 'version', '') ~ '^[0-9]+$'
    and (e ->> 'version')::int > 0
    and coalesce(e ->> 'accepted_at', '') <> '';
  if v_consent_count < array_length(v_required_consents, 1) then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  select * into v_settings from business_settings where id = true;

  select * into v_slot from availability_slots where id = p_slot_id for update;
  if not found then
    raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if not v_slot.is_published then
    raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if not is_allowed_slot_time(v_slot.starts_at, v_settings.timezone) then
    raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if v_slot.starts_at <= now() + make_interval(hours => v_settings.min_lead_hours) then
    raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  v_date := (v_slot.starts_at at time zone v_settings.timezone)::date;

  if exists (select 1 from blocked_dates where blocked_date = v_date) then
    raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from appointments
    where slot_id = p_slot_id
      and (
        status in ('pending_review', 'confirmed', 'reschedule_requested')
        or (status = 'awaiting_deposit' and (deposit_due_at is null or deposit_due_at > now()))
      )
  ) then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end if;

  select count(*) into v_active_count
  from appointments a
  join availability_slots s on s.id = a.slot_id
  where (
      a.status in ('pending_review', 'confirmed', 'reschedule_requested')
      or (a.status = 'awaiting_deposit' and (a.deposit_due_at is null or a.deposit_due_at > now()))
    )
    and (s.starts_at at time zone v_settings.timezone)::date = v_date;

  if v_active_count >= max_active_per_day_for(v_slot.starts_at, v_settings.timezone) then
    raise exception 'DAY_FULL' using errcode = 'P0001';
  end if;

  -- 8 chars from a 32-char alphabet via a cryptographic RNG (was 4 chars via
  -- random() — auditoría: ~20 bits was guessable even with rate limiting).
  loop
    v_code := 'GB-' || (
      select string_agg(
        substr(
          '23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
          (get_byte(gen_random_bytes(1), 0) % 32) + 1,
          1
        ),
        ''
      )
      from generate_series(1, 8)
    );
    exit when not exists (select 1 from appointments where code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception 'CODE_GENERATION_FAILED' using errcode = 'P0001';
    end if;
  end loop;

  insert into appointments (
    code, slot_id, dog_name, size_bucket, breed, coat_state, service_package, notes,
    logistics_mode, neighborhood, pickup_address, owner_name, phone_e164, email, consents, status
  ) values (
    v_code, p_slot_id, p_dog_name, p_size_bucket, p_breed, p_coat_state, p_service_package, p_notes,
    p_logistics_mode, p_neighborhood, p_pickup_address, p_owner_name, p_phone_e164, p_email,
    p_consents, 'pending_review'
  ) returning id into v_appointment_id;

  insert into appointment_events (appointment_id, event_type, actor)
  values (v_appointment_id, 'created', 'system');

  return query select v_code, v_appointment_id, v_slot.starts_at;
end;
$$;
grant execute on function request_appointment(
  uuid, text, size_bucket, text, coat_state, service_package, text, logistics_mode, text, text, text, text, text, jsonb, text
) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. admin_publish_slot: day-of-week-aware time/cap check, and a fix so
--    re-publishing an already-published slot is a true no-op (previously it
--    re-counted itself against the day cap and could spuriously raise
--    DAY_FULL, and always tripped GAP_WARNING against its own timestamp).
-- ---------------------------------------------------------------------
create or replace function admin_publish_slot(p_starts_at timestamptz, p_force boolean default false)
returns table (slot_id uuid, warning text)
language plpgsql security definer set search_path = public as $$
declare
  v_settings business_settings%rowtype;
  v_date date;
  v_published_count int;
  v_nearest_gap_minutes numeric;
  v_slot_id uuid;
  v_already_published boolean;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_settings from business_settings where id = true;

  if not is_allowed_slot_time(p_starts_at, v_settings.timezone) then
    raise exception 'INVALID_TIME' using errcode = 'P0001';
  end if;

  v_date := (p_starts_at at time zone v_settings.timezone)::date;

  select is_published into v_already_published
  from availability_slots where starts_at = p_starts_at;

  if not coalesce(v_already_published, false) then
    select count(*) into v_published_count
    from availability_slots s
    where (s.starts_at at time zone v_settings.timezone)::date = v_date
      and s.is_published = true;

    if v_published_count >= max_active_per_day_for(p_starts_at, v_settings.timezone) then
      raise exception 'DAY_FULL' using errcode = 'P0001';
    end if;
  end if;

  select min(extract(epoch from abs(s.starts_at - p_starts_at)) / 60) into v_nearest_gap_minutes
  from availability_slots s
  where (s.starts_at at time zone v_settings.timezone)::date = v_date
    and s.is_published = true
    and s.starts_at <> p_starts_at;

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
revoke execute on function admin_publish_slot(timestamptz, boolean) from public;

-- ---------------------------------------------------------------------
-- 5. admin_set_slot_visibility: same day-of-week-aware checks as above.
-- ---------------------------------------------------------------------
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

  if not is_allowed_slot_time(v_slot.starts_at, v_settings.timezone) then
    raise exception 'INVALID_TIME' using errcode = 'P0001';
  end if;

  v_date := (v_slot.starts_at at time zone v_settings.timezone)::date;

  select count(*) into v_published_count
  from availability_slots s
  where (s.starts_at at time zone v_settings.timezone)::date = v_date
    and s.is_published = true
    and s.id <> p_slot_id;

  if v_published_count >= max_active_per_day_for(v_slot.starts_at, v_settings.timezone) then
    raise exception 'DAY_FULL' using errcode = 'P0001';
  end if;

  update availability_slots set is_published = true where id = p_slot_id;
end;
$$;
grant execute on function admin_set_slot_visibility(uuid, boolean) to authenticated;
revoke execute on function admin_set_slot_visibility(uuid, boolean) from public;

-- ---------------------------------------------------------------------
-- 6. admin_set_appointment_status: the reschedule branch gains the same
--    validation request_appointment already does for a fresh booking
--    (published, future, not blocked, allowed time, day cap) — previously it
--    only checked for a conflicting appointment on the exact target slot.
-- ---------------------------------------------------------------------
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
  v_new_slot availability_slots%rowtype;
  v_settings business_settings%rowtype;
  v_active_count int;
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

    select * into v_settings from business_settings where id = true;
    select * into v_new_slot from availability_slots where id = p_new_slot_id for update;
    if not found then
      raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    if not v_new_slot.is_published then
      raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    if v_new_slot.starts_at <= now() + make_interval(hours => v_settings.min_lead_hours) then
      raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    if not is_allowed_slot_time(v_new_slot.starts_at, v_settings.timezone) then
      raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from blocked_dates
      where blocked_date = (v_new_slot.starts_at at time zone v_settings.timezone)::date
    ) then
      raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from appointments
      where slot_id = p_new_slot_id
        and status in ('pending_review', 'confirmed', 'reschedule_requested')
        and id <> p_appointment_id
    ) then
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
    end if;

    select count(*) into v_active_count
    from appointments a
    join availability_slots s on s.id = a.slot_id
    where a.status in ('pending_review', 'confirmed', 'reschedule_requested')
      and a.id <> p_appointment_id
      and (s.starts_at at time zone v_settings.timezone)::date
        = (v_new_slot.starts_at at time zone v_settings.timezone)::date;
    if v_active_count >= max_active_per_day_for(v_new_slot.starts_at, v_settings.timezone) then
      raise exception 'DAY_FULL' using errcode = 'P0001';
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
revoke execute on function admin_set_appointment_status(uuid, appointment_status, uuid, text) from public;

-- ---------------------------------------------------------------------
-- 7. enforce_rate_limit was never revoked from PUBLIC in the original public
--    migration (unlike every admin function) — anon could call it directly
--    and insert arbitrary keys into request_throttle. It still needs to be
--    directly callable by `service_role`, which throttles the admin-login
--    magic-link request from app/admin/login/actions.ts (server-side, before
--    ever calling Supabase Auth) — everything else reaches it only
--    indirectly, from inside another SECURITY DEFINER function.
-- ---------------------------------------------------------------------
revoke execute on function enforce_rate_limit(text, int, interval) from public;
grant execute on function enforce_rate_limit(text, int, interval) to service_role;

-- ---------------------------------------------------------------------
-- 8. payments: reject a non-positive amount outright.
-- ---------------------------------------------------------------------
alter table payments add constraint payments_amount_positive check (amount_ars > 0);

-- ---------------------------------------------------------------------
-- 9. Add the per-installment card surcharge column alongside the old
--    single-percentage one. `card_surcharge_percent` is intentionally NOT
--    dropped here — it stays until a follow-up migration confirms
--    `card_surcharge_options` is adopted by the app, so there is no window
--    where a value in the old column could be lost. See
--    lib/config/business.ts `deposit.paymentOptions` (disabled by default —
--    see docs/auditoria-seguridad-y-cumplimiento-good-boy.md).
-- ---------------------------------------------------------------------
alter table business_settings add column if not exists card_surcharge_options jsonb;

-- ---------------------------------------------------------------------
-- 10. Defense-in-depth length/format constraints on `appointments` — an
--     admin has `all` via RLS, so these must hold even for a direct write,
--     not just through request_appointment's own checks above.
-- ---------------------------------------------------------------------
alter table appointments
  add constraint appointments_dog_name_len check (char_length(dog_name) between 1 and 80),
  add constraint appointments_owner_name_len check (char_length(owner_name) between 1 and 80),
  add constraint appointments_breed_len check (breed is null or char_length(breed) <= 100),
  add constraint appointments_neighborhood_len check (neighborhood is null or char_length(neighborhood) <= 100),
  add constraint appointments_pickup_address_len check (pickup_address is null or char_length(pickup_address) <= 200),
  add constraint appointments_notes_len check (notes is null or char_length(notes) <= 1000),
  add constraint appointments_email_format check (
    email is null or email = '' or (
      char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    )
  ),
  add constraint appointments_phone_format check (phone_e164 ~ '^\+\d{10,15}$');
