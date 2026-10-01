-- Public-facing RPCs. All SECURITY DEFINER, all granted to `anon`. Each one
-- is intentionally narrow about what it returns/accepts.

create or replace function enforce_rate_limit(p_key text, p_max_per_window int, p_window interval)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row request_throttle%rowtype;
begin
  select * into v_row from request_throttle where key = p_key for update;

  if not found then
    insert into request_throttle (key, window_start, count) values (p_key, now(), 1);
    return;
  end if;

  if now() - v_row.window_start > p_window then
    update request_throttle set window_start = now(), count = 1 where key = p_key;
    return;
  end if;

  if v_row.count >= p_max_per_window then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  update request_throttle set count = v_row.count + 1 where key = p_key;
end;
$$;

-- Anonymized availability: only what's needed to render the day/slot
-- pickers. Excludes anything already occupied and anything on a blocked
-- date. An `awaiting_deposit` appointment whose deposit window has passed is
-- treated as if it no longer occupies the slot (lazy expiration — see
-- expire_overdue_deposits() for the RPC that eventually writes `expired`).
create or replace function public_availability()
returns table (slot_id uuid, starts_at timestamptz, date_key text)
language sql stable security definer set search_path = public as $$
  select s.id, s.starts_at,
    to_char(s.starts_at at time zone (select timezone from business_settings where id = true), 'YYYY-MM-DD')
  from availability_slots s
  where s.is_published = true
    and s.starts_at > now()
    and not exists (
      select 1 from blocked_dates b
      where b.blocked_date = (s.starts_at at time zone (select timezone from business_settings where id = true))::date
    )
    and not exists (
      select 1 from appointments a
      where a.slot_id = s.id
        and a.status in ('pending_review', 'confirmed', 'reschedule_requested')
    )
    and not exists (
      select 1 from appointments a
      where a.slot_id = s.id
        and a.status = 'awaiting_deposit'
        and (a.deposit_due_at is null or a.deposit_due_at > now())
    )
  order by s.starts_at;
$$;
grant execute on function public_availability() to anon, authenticated;

-- The booking transaction: locks the slot row, re-validates every rule
-- server-side (never trusting the client's idea of "available"), then
-- inserts as `pending_review`. Two concurrent calls for the same slot
-- serialize on the row lock; the loser sees SLOT_TAKEN once it re-checks
-- after acquiring the lock.
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
begin
  perform enforce_rate_limit('booking:' || p_client_key, 5, interval '10 minutes');

  select * into v_settings from business_settings where id = true;

  select * into v_slot from availability_slots where id = p_slot_id for update;
  if not found then
    raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if not v_slot.is_published then
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

  if v_active_count >= v_settings.max_active_per_day then
    raise exception 'DAY_FULL' using errcode = 'P0001';
  end if;

  loop
    v_code := 'GB-' || (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 4)
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
    coalesce(p_consents, '[]'::jsonb), 'pending_review'
  ) returning id into v_appointment_id;

  insert into appointment_events (appointment_id, event_type, actor)
  values (v_appointment_id, 'created', 'system');

  return query select v_code, v_appointment_id, v_slot.starts_at;
end;
$$;
grant execute on function request_appointment(
  uuid, text, size_bucket, text, coat_state, service_package, text, logistics_mode, text, text, text, text, text, jsonb, text
) to anon, authenticated;

-- Status lookup: code is entered via a POST form, never in the URL, and
-- returns nothing personal — no name, phone or pickup address.
-- `deposit_amount_ars`/`deposit_due_at` are only meaningful while
-- `awaiting_deposit`; harmless to always return since the amount is public
-- pricing info, not personal data.
create or replace function get_appointment_status(p_code text, p_client_key text default 'unknown')
returns table (
  code text,
  status appointment_status,
  starts_at timestamptz,
  previous_starts_at timestamptz,
  deposit_amount_ars numeric,
  deposit_due_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  perform enforce_rate_limit('status:' || p_client_key, 10, interval '1 minute');

  return query
  select
    a.code,
    a.status,
    s.starts_at,
    (
      select prev_slot.starts_at
      from appointment_events e
      join availability_slots prev_slot on prev_slot.id = e.from_slot_id
      where e.appointment_id = a.id and e.event_type = 'rescheduled'
      order by e.created_at desc
      limit 1
    ),
    (select deposit_amount_ars from business_settings where id = true),
    a.deposit_due_at
  from appointments a
  join availability_slots s on s.id = a.slot_id
  where a.code = upper(trim(p_code));
end;
$$;
grant execute on function get_appointment_status(text, text) to anon, authenticated;
