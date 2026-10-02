-- Dev/preview seed data ONLY. Never run against production (see README).
-- Mirrors realistic examples for the v2 deposit flow, updated for the v3
-- weekday/Saturday schedule (docs/plan-web-good-boy.md §2): Toby/Mora
-- confirmed "today" (or the nearest valid day if today is Sat/Sun), Luna
-- awaiting her deposit, Rocco still pending review, Nina cancelled, plus one
-- Saturday 11:00 example. Every timestamp below is computed to satisfy the
-- `availability_slots_schedule_guard` trigger added in
-- 20260101000006_v3_hardening.sql regardless of what day this runs on.

create or replace function _seed_next_isodow(p_after date, p_target_isodow int)
returns date
language plpgsql as $fn$
declare
  d date := p_after + 1;
begin
  while extract(isodow from d)::int <> p_target_isodow loop
    d := d + 1;
  end loop;
  return d;
end;
$fn$;

do $$
declare
  v_tz text := 'America/Argentina/Cordoba';
  v_today date := (now() at time zone v_tz)::date;
  v_today_dow int := extract(isodow from v_today)::int; -- 1=Mon .. 7=Sun
  v_today_1 timestamptz;
  v_today_2 timestamptz; -- null when today only allows one slot (Saturday)
  v_day_wed date := _seed_next_isodow(v_today, 3);
  v_day_thu date := _seed_next_isodow(v_today, 4);
  v_day_fri date := _seed_next_isodow(v_today, 5);
  v_day_sat date := _seed_next_isodow(v_today, 6);
  v_slot_today_1 uuid;
  v_slot_today_2 uuid;
  v_slot_wed uuid;
  v_slot_thu uuid;
  v_slot_fri uuid;
  v_appt_id uuid;
begin
  if v_today_dow <= 5 then
    v_today_1 := (v_today::text || ' 09:00')::timestamp at time zone v_tz;
    v_today_2 := (v_today::text || ' 13:30')::timestamp at time zone v_tz;
  elsif v_today_dow = 6 then
    -- Saturday: only one slot exists at all (11:00, max 1/day).
    v_today_1 := (v_today::text || ' 11:00')::timestamp at time zone v_tz;
    v_today_2 := null;
  else
    -- Sunday is closed — anchor the "today" demo slots to the next Monday.
    v_today_1 :=
      (_seed_next_isodow(v_today, 1)::text || ' 09:00')::timestamp at time zone v_tz;
    v_today_2 :=
      (_seed_next_isodow(v_today, 1)::text || ' 13:30')::timestamp at time zone v_tz;
  end if;

  insert into availability_slots (starts_at, is_published)
  values (v_today_1, true) returning id into v_slot_today_1;

  insert into availability_slots (starts_at, is_published)
  values ((v_day_wed::text || ' 09:00')::timestamp at time zone v_tz, true)
  returning id into v_slot_wed;
  insert into availability_slots (starts_at, is_published)
  values ((v_day_thu::text || ' 11:30')::timestamp at time zone v_tz, true)
  returning id into v_slot_thu;
  insert into availability_slots (starts_at, is_published)
  values ((v_day_fri::text || ' 13:30')::timestamp at time zone v_tz, true)
  returning id into v_slot_fri;

  -- A couple more published-but-free slots so the picker/preview has
  -- something: a second weekday slot and the one Saturday slot of the week.
  insert into availability_slots (starts_at, is_published)
  values ((v_day_wed::text || ' 13:30')::timestamp at time zone v_tz, true);
  insert into availability_slots (starts_at, is_published)
  values ((v_day_sat::text || ' 11:00')::timestamp at time zone v_tz, true);

  insert into appointments (
    code, slot_id, dog_name, size_bucket, breed, coat_state, service_package, notes,
    logistics_mode, owner_name, phone_e164, email, status
  ) values (
    'GB-2H6D7X9K', v_slot_today_1, 'Toby', 'pequeno', 'Caniche', 'largo', 'crecimiento_continuo',
    'Primera vez con corte.', 'self', 'Marcela', '+5493510000001', 'cliente1@example.com', 'confirmed'
  ) returning id into v_appt_id;
  insert into payments (appointment_id, amount_ars, method, status, verified_at)
  values (v_appt_id, 20000, 'bank_transfer', 'verified', now() - interval '1 day');

  if v_today_2 is not null then
    insert into availability_slots (starts_at, is_published)
    values (v_today_2, true) returning id into v_slot_today_2;

    insert into appointments (
      code, slot_id, dog_name, size_bucket, breed, coat_state, service_package, notes,
      logistics_mode, neighborhood, pickup_address, owner_name, phone_e164, email, status
    ) values (
      'GB-8F2NQR4M', v_slot_today_2, 'Mora', 'grande', 'Golden', 'con_nudos', 'corto_doble_capa', null,
      'pickup', 'Las Palmas', 'Calle de ejemplo 000', 'Diego', '+5493510000002', 'cliente2@example.com', 'confirmed'
    ) returning id into v_appt_id;
    insert into payments (appointment_id, amount_ars, method, status, verified_at)
    values (v_appt_id, 20000, 'mercadopago_link', 'verified', now() - interval '1 day');
  end if;

  insert into appointments (
    code, slot_id, dog_name, size_bucket, breed, coat_state, service_package, notes,
    logistics_mode, neighborhood, pickup_address, owner_name, phone_e164, email, status, deposit_due_at
  ) values (
    'GB-7K4QW2ZP', v_slot_wed, 'Luna', 'mediano', 'Mestiza', 'largo', 'crecimiento_continuo',
    'Le molesta el secador fuerte.',
    'pickup', 'Las Palmas', 'Calle de ejemplo 111', 'Carolina', '+5493510000003', 'cliente3@example.com',
    'awaiting_deposit', now() + interval '20 hours'
  );

  insert into appointments (
    code, slot_id, dog_name, size_bucket, breed, coat_state, service_package, notes,
    logistics_mode, owner_name, phone_e164, email, status
  ) values (
    'GB-3M8PX7YN', v_slot_thu, 'Rocco', 'grande', 'Ovejero', 'corto', 'corto_doble_capa', null,
    'self', 'Pablo', '+5493510000004', 'cliente4@example.com', 'pending_review'
  );

  insert into appointments (
    code, slot_id, dog_name, size_bucket, breed, coat_state, service_package, notes,
    logistics_mode, neighborhood, pickup_address, owner_name, phone_e164, email, status
  ) values (
    'GB-5Q1TK8DH', v_slot_fri, 'Nina', 'pequeno', 'Yorkshire', 'no_se', 'crecimiento_continuo',
    'Es miedosa con extraños.',
    'pickup', '[barrio de ejemplo]', 'Calle de ejemplo 222', 'Sofía', '+5493510000005', 'cliente5@example.com',
    'cancelled_by_client'
  );
end $$;

drop function _seed_next_isodow(date, int);
