-- Deny-by-default RLS on every table. Public reads/writes never touch these
-- tables directly — they go through the SECURITY DEFINER RPCs in the next
-- migration, which are the only functions granted to `anon`.

alter table admin_profiles enable row level security;
alter table business_settings enable row level security;
alter table availability_slots enable row level security;
alter table appointments enable row level security;
alter table appointment_events enable row level security;
alter table payments enable row level security;
alter table blocked_dates enable row level security;
alter table request_throttle enable row level security;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_profiles where id = auth.uid());
$$;

-- admin_profiles: a signed-in user can see their own row. Rows are created
-- by the server-only admin login callback (service role, after checking
-- ADMIN_EMAIL_ALLOWLIST) — never by a client-side insert.
create policy admin_profiles_self_select on admin_profiles
  for select using (id = auth.uid());

create policy business_settings_admin_select on business_settings
  for select using (is_admin());

create policy availability_slots_admin_all on availability_slots
  for all using (is_admin()) with check (is_admin());

create policy appointments_admin_all on appointments
  for all using (is_admin()) with check (is_admin());

create policy appointment_events_admin_select on appointment_events
  for select using (is_admin());

-- payments: admin can read; every write (record/reverse a deposit) goes
-- through a SECURITY DEFINER RPC that logs an appointment_event, never a
-- direct insert/update — no write policy is intentional.
create policy payments_admin_select on payments
  for select using (is_admin());

create policy blocked_dates_admin_all on blocked_dates
  for all using (is_admin()) with check (is_admin());

-- request_throttle has no policies at all: only the SECURITY DEFINER
-- enforce_rate_limit() function touches it, which bypasses RLS by design.
