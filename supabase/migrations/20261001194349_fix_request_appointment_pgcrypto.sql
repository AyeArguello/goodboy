-- request_appointment runs with `set search_path = public`, but Supabase
-- installs pgcrypto in the `extensions` schema, so the unqualified
-- gen_random_bytes() call failed with 42883 (function does not exist) and no
-- booking could be created. This recreates the current function unchanged
-- except for schema-qualifying that one call.

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
          (get_byte(extensions.gen_random_bytes(1), 0) % 32) + 1,
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
