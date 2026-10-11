-- Default schedule + manual bookings.
--
-- 1. The weekly grid (Mon-Fri 09:00 / 11:30 / 13:30, Saturday 11:00, Sunday
--    closed, business time zone) is generated automatically through the end
--    of the month after next (in October: October, November and December; in
--    December: December, January and February) and published by default. The owner no longer loads days by hand: she
--    only removes what she will not attend (hide a slot, or block a whole day)
--    and can put it back. Generation never touches a row that already exists, so
--    a slot she hid stays hidden.
-- 2. The public availability list now only offers the next 6 weeks and makes
--    sure the schedule exists (generating it the first time, and again as the
--    window moves).
-- 3. admin_unblock_date: the missing counterpart of admin_block_date.
-- 4. admin_create_appointment: the owner books a turn by hand (phone, WhatsApp,
--    in person) on a free slot, with the same agenda rules a customer gets
--    (slot free, day not full, valid grid time) and without the customer-side
--    requirements (24 h notice, email, consents).

-- ---------------------------------------------------------------------
-- 1. ensure_default_slots
-- ---------------------------------------------------------------------
-- p_days null (the default) = through the end of the month after next;
-- a number = that many days from today (used by tests and one-off tools).
create or replace function ensure_default_slots(p_days int default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
  v_today date;
  v_last date;
  v_day date;
  v_time time;
  v_times time[];
  v_starts timestamptz;
  v_rows int;
  v_inserted int := 0;
begin
  if p_days is not null and (p_days < 1 or p_days > 400) then
    raise exception 'INVALID_ARGUMENT' using errcode = 'P0001';
  end if;

  select bs.timezone into v_tz from business_settings bs where bs.id = true;
  v_today := (now() at time zone v_tz)::date;
  v_last := case
    when p_days is null then (date_trunc('month', v_today::timestamp) + interval '3 months')::date - 1
    else v_today + p_days
  end;

  for v_day in
    select g::date from generate_series(v_today, v_last, interval '1 day') as g
  loop
    v_times := case extract(isodow from v_day)::int
      when 7 then array[]::time[]
      when 6 then array['11:00']::time[]
      else array['09:00', '11:30', '13:30']::time[]
    end;

    foreach v_time in array v_times loop
      v_starts := (v_day + v_time) at time zone v_tz;
      if v_starts > now() then
        insert into availability_slots (starts_at, is_published)
        values (v_starts, true)
        on conflict (starts_at) do nothing;
        get diagnostics v_rows = row_count;
        v_inserted := v_inserted + v_rows;
      end if;
    end loop;
  end loop;

  return v_inserted;
end;
$$;

revoke execute on function ensure_default_slots(int) from public, anon, authenticated;
grant execute on function ensure_default_slots(int) to service_role;

-- ---------------------------------------------------------------------
-- 2. public_availability: the next 6 weeks, schedule generated on demand
--    (any slot beyond 55 days means the window is complete: it reaches at
--    least 61 days ahead).
--    Same occupancy rule as before (an awaiting_deposit turn whose window
--    lapsed frees its slot unless a receipt registered in time is waiting).
-- ---------------------------------------------------------------------
create or replace function public_availability()
returns table (slot_id uuid, starts_at timestamptz, date_key text)
language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
begin
  select bs.timezone into v_tz from business_settings bs where bs.id = true;

  -- Cheap, indexed check: only when the generated window is running out (or
  -- has never been created) does this write anything.
  if not exists (
    select 1 from availability_slots g where g.starts_at > now() + interval '55 days'
  ) then
    perform ensure_default_slots();
  end if;

  return query
  select s.id, s.starts_at,
    to_char(s.starts_at at time zone v_tz, 'YYYY-MM-DD')
  from availability_slots s
  where s.is_published = true
    and s.starts_at > now()
    and s.starts_at < now() + interval '42 days'
    and not exists (
      select 1 from blocked_dates b
      where b.blocked_date = (s.starts_at at time zone v_tz)::date
    )
    and not exists (
      select 1 from appointments a
      where a.slot_id = s.id
        and (
          a.status in ('pending_review', 'confirmed', 'reschedule_requested')
          or (
            a.status = 'awaiting_deposit'
            and (
              a.deposit_due_at is null
              or a.deposit_due_at > now()
              or exists (
                select 1 from payment_receipts r
                where r.appointment_id = a.id
                  and r.status = 'pending_verification'
                  and r.uploaded_at <= a.deposit_due_at
              )
            )
          )
        )
    )
  order by s.starts_at;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. admin_unblock_date
-- ---------------------------------------------------------------------
create or replace function admin_unblock_date(p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  delete from blocked_dates bd where bd.blocked_date = p_date;
end;
$$;

revoke execute on function admin_unblock_date(date) from public, anon, service_role;
grant execute on function admin_unblock_date(date) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Manual bookings. Customers must leave an email (it is the notification
--    channel); a turn the owner books by phone or in person may have none, so
--    the guard steps aside for the transaction that admin_create_appointment
--    opens (a transaction-local setting only that function sets).
-- ---------------------------------------------------------------------
create or replace function appointments_require_email() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.manual_booking', true), '') = 'on' then
    return new;
  end if;
  if new.email is null or btrim(new.email) = '' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function admin_create_appointment(
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
  p_initial_status text,               -- 'confirmed' | 'awaiting_deposit'
  p_deposit_method payment_method default null, -- with 'confirmed': the deposit was already received
  p_force boolean default false        -- also allow a hidden slot or a blocked date
)
returns table (appointment_id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare
  v_settings business_settings%rowtype;
  v_slot availability_slots%rowtype;
  v_date date;
  v_active_count int;
  v_code text;
  v_attempts int := 0;
  v_id uuid;
  v_status appointment_status;
  v_constraint text;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if p_initial_status not in ('confirmed', 'awaiting_deposit') then
    raise exception 'INVALID_ARGUMENT' using errcode = 'P0001';
  end if;
  if p_deposit_method is not null and p_initial_status <> 'confirmed' then
    raise exception 'INVALID_ARGUMENT' using errcode = 'P0001';
  end if;

  -- The same input rules the public form enforces (the table CHECKs repeat them).
  if p_dog_name is null or char_length(btrim(p_dog_name)) not between 1 and 80
     or p_owner_name is null or char_length(btrim(p_owner_name)) not between 1 and 80
     or p_phone_e164 is null or p_phone_e164 !~ '^\+\d{10,15}$'
     or (p_breed is not null and char_length(p_breed) > 100)
     or (p_notes is not null and char_length(p_notes) > 1000)
     or (p_neighborhood is not null and char_length(p_neighborhood) > 100)
     or (p_pickup_address is not null and char_length(p_pickup_address) > 200)
     or (
       p_email is not null and btrim(p_email) <> ''
       and (char_length(p_email) > 254 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
     )
     or (
       p_logistics_mode = 'pickup'
       and (nullif(btrim(p_neighborhood), '') is null or nullif(btrim(p_pickup_address), '') is null)
     )
  then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  select * into v_settings from business_settings bs where bs.id = true;

  select * into v_slot from availability_slots s where s.id = p_slot_id for update;
  if not found then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not is_allowed_slot_time(v_slot.starts_at, v_settings.timezone) then
    raise exception 'INVALID_TIME' using errcode = 'P0001';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'SLOT_IN_PAST' using errcode = 'P0001';
  end if;

  v_date := (v_slot.starts_at at time zone v_settings.timezone)::date;

  if not p_force then
    if not v_slot.is_published
       or exists (select 1 from blocked_dates bd where bd.blocked_date = v_date) then
      raise exception 'SLOT_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
  end if;

  -- Taken: never bypassable. Same rule request_appointment applies.
  if exists (
    select 1 from appointments a
    where a.slot_id = p_slot_id
      and (
        a.status in ('pending_review', 'confirmed', 'reschedule_requested')
        or (
          a.status = 'awaiting_deposit'
          and (
            a.deposit_due_at is null
            or a.deposit_due_at > now()
            or exists (
              select 1 from payment_receipts r
              where r.appointment_id = a.id
                and r.status = 'pending_verification'
                and r.uploaded_at <= a.deposit_due_at
            )
          )
        )
      )
  ) then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end if;

  -- Day cap: never bypassable either.
  select count(*) into v_active_count
  from appointments a
  join availability_slots s on s.id = a.slot_id
  where (
    a.status in ('pending_review', 'confirmed', 'reschedule_requested')
    or (
      a.status = 'awaiting_deposit'
      and (
        a.deposit_due_at is null
        or a.deposit_due_at > now()
        or exists (
          select 1 from payment_receipts r
          where r.appointment_id = a.id
            and r.status = 'pending_verification'
            and r.uploaded_at <= a.deposit_due_at
        )
      )
    )
  )
    and (s.starts_at at time zone v_settings.timezone)::date = v_date;

  if v_active_count >= max_active_per_day_for(v_slot.starts_at, v_settings.timezone) then
    raise exception 'DAY_FULL' using errcode = 'P0001';
  end if;

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
    exit when not exists (
      select 1 from appointments as a where a.code = v_code
    );
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception 'CODE_GENERATION_FAILED' using errcode = 'P0001';
    end if;
  end loop;

  v_status := p_initial_status::appointment_status;
  perform set_config('app.manual_booking', 'on', true);

  begin
    insert into appointments (
      code, slot_id, dog_name, size_bucket, breed, coat_state, service_package, notes,
      logistics_mode, neighborhood, pickup_address, owner_name, phone_e164, email,
      admin_notes, status, deposit_due_at
    ) values (
      v_code, p_slot_id, btrim(p_dog_name), p_size_bucket, nullif(btrim(p_breed), ''),
      p_coat_state, p_service_package, nullif(btrim(p_notes), ''),
      p_logistics_mode, nullif(btrim(p_neighborhood), ''), nullif(btrim(p_pickup_address), ''),
      btrim(p_owner_name), p_phone_e164, nullif(btrim(p_email), ''),
      'Turno cargado a mano desde el panel.', v_status,
      case when v_status = 'awaiting_deposit'
        then now() + make_interval(hours => v_settings.deposit_due_hours)
        else null end
    ) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'appointments_active_per_slot_idx' then
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
    end if;
    raise;
  end;

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (v_id, 'created', 'admin', auth.uid(), 'Turno cargado a mano desde el panel');

  if p_deposit_method is not null then
    insert into payments (
      appointment_id, amount_ars, method, status, verified_by, note
    ) values (
      v_id, v_settings.deposit_amount_ars, p_deposit_method, 'verified', auth.uid(),
      'Seña registrada al cargar el turno a mano'
    );
    insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
    values (v_id, 'deposit_recorded', 'admin', auth.uid(), 'Seña registrada al cargar el turno');
  end if;

  return query select v_id, v_code;
end;
$$;

revoke execute on function admin_create_appointment(
  uuid, text, size_bucket, text, coat_state, service_package, text, logistics_mode,
  text, text, text, text, text, text, payment_method, boolean
) from public, anon, service_role;
grant execute on function admin_create_appointment(
  uuid, text, size_bucket, text, coat_state, service_package, text, logistics_mode,
  text, text, text, text, text, text, payment_method, boolean
) to authenticated;
