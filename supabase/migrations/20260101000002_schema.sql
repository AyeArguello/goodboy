-- Core schema (v2: deposit-required lifecycle). NAP/WhatsApp/pricing copy
-- intentionally do NOT live here — they're in lib/config/business.ts per the
-- client's rule that unconfirmed business data lives in a typed config file,
-- not the database. Money-related *rules* (amounts, cutoffs) do live here in
-- business_settings so an admin can eventually tune them without a redeploy.

create type appointment_status as enum (
  'pending_review',
  'awaiting_deposit',
  'confirmed',
  'reschedule_requested',
  'cancelled_by_client',
  'cancelled_by_business',
  'deposit_forfeited',
  'completed',
  'no_show',
  'expired'
);
create type appointment_event_type as enum (
  'created', 'approved', 'rejected', 'deposit_recorded', 'deposit_reversed',
  'rescheduled', 'cancelled', 'completed', 'no_show', 'expired', 'forfeited', 'reverted'
);
create type event_actor as enum ('system', 'admin');
create type logistics_mode as enum ('self', 'pickup');
create type size_bucket as enum ('pequeno', 'mediano', 'grande');
create type coat_state as enum ('corto', 'largo', 'con_nudos', 'no_se');
create type service_package as enum ('corto_doble_capa', 'crecimiento_continuo');
create type payment_method as enum ('cash', 'bank_transfer', 'mercadopago_link');
create type payment_status as enum ('pending', 'verified', 'reversed');

create table admin_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

-- Singleton row (id is always `true`) holding operational rules the owner
-- might tune later. NAP/WhatsApp stay out of this table on purpose.
create table business_settings (
  id boolean primary key default true,
  timezone text not null default 'America/Argentina/Cordoba',
  min_lead_hours int not null default 24,
  cancellation_cutoff_hours int not null default 48,
  max_active_per_day int not null default 3,
  warn_gap_minutes int not null default 150,
  deposit_amount_ars numeric(10, 2) not null default 20000,
  deposit_due_hours int not null default 24,
  -- null until Mercado Pago's card surcharge is confirmed — never hardcode a percentage.
  card_surcharge_percent numeric(5, 2),
  updated_at timestamptz not null default now(),
  constraint business_settings_singleton check (id)
);
insert into business_settings (id) values (true);

create table availability_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null unique,
  is_published boolean not null default false,
  created_by uuid references admin_profiles (id),
  created_at timestamptz not null default now()
);
create index availability_slots_starts_at_idx on availability_slots (starts_at);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  slot_id uuid not null references availability_slots (id),
  dog_name text not null,
  size_bucket size_bucket not null,
  breed text,
  coat_state coat_state,
  service_package service_package not null,
  notes text,
  logistics_mode logistics_mode not null,
  neighborhood text,
  pickup_address text,
  owner_name text not null,
  phone_e164 text not null,
  email text,
  consents jsonb not null default '[]'::jsonb,
  admin_notes text,
  status appointment_status not null default 'pending_review',
  -- Set when an admin approves the request; a lazily-expired or
  -- explicitly-expired (expire_overdue_deposits()) row frees its slot.
  deposit_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_requires_address check (
    logistics_mode <> 'pickup' or (neighborhood is not null and pickup_address is not null)
  )
);
-- The line of defense against double-booking: only one row occupying the
-- slot's active lifecycle states may reference a given slot at a time.
create unique index appointments_active_per_slot_idx
  on appointments (slot_id)
  where status in ('pending_review', 'awaiting_deposit', 'confirmed', 'reschedule_requested');
create index appointments_status_idx on appointments (status);
create index appointments_code_idx on appointments (code);
create index appointments_deposit_due_at_idx on appointments (deposit_due_at) where status = 'awaiting_deposit';

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger appointments_set_updated_at
before update on appointments
for each row execute function set_updated_at();

create table appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments (id) on delete cascade,
  event_type appointment_event_type not null,
  actor event_actor not null,
  admin_id uuid references admin_profiles (id),
  from_slot_id uuid references availability_slots (id),
  to_slot_id uuid references availability_slots (id),
  note text,
  created_at timestamptz not null default now()
);
create index appointment_events_appointment_id_idx on appointment_events (appointment_id);

-- Full payment audit trail — every deposit charge/verification/reversal.
create table payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments (id) on delete cascade,
  type text not null default 'deposit' check (type = 'deposit'),
  amount_ars numeric(10, 2) not null,
  method payment_method not null,
  status payment_status not null default 'verified',
  external_reference text,
  verified_by uuid references admin_profiles (id),
  verified_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);
create index payments_appointment_id_idx on payments (appointment_id);

create table blocked_dates (
  id uuid primary key default gen_random_uuid(),
  blocked_date date not null unique,
  reason text,
  created_by uuid references admin_profiles (id),
  created_at timestamptz not null default now()
);

-- Minimal DB-backed rate limiter for the public RPCs (no external service
-- in the MVP). See enforce_rate_limit() in the RPC migration.
create table request_throttle (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);
