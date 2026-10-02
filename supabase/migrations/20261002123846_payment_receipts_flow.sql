-- Manual bank-transfer deposit flow with payment receipts (comprobantes).
--
-- Adds: private receipt metadata (files live in Supabase Storage, never in
-- Postgres), single-use upload tokens (only a SHA-256 hash is stored), an
-- email outbox for idempotent/retryable notifications, retention + purge
-- support, a refund record, and the RPCs the admin panel and the server use.
-- Nothing here edits an already-applied migration.
--
-- Security model, in short:
--   * Every new table is RLS deny-by-default. Only admins can SELECT receipts
--     and the outbox; nobody can write them directly (all writes go through
--     the SECURITY DEFINER functions below).
--   * Supabase's default privileges grant EXECUTE on new public functions to
--     `anon` and `authenticated`, so every function below explicitly REVOKEs
--     from public/anon/authenticated and grants only what it needs.
--   * Functions used by the upload/purge/outbox server code are granted to
--     `service_role` only; admin functions to `authenticated` (and each one
--     checks is_admin() itself).

-- ---------------------------------------------------------------------
-- 1. Enum values and types
-- ---------------------------------------------------------------------
alter type appointment_event_type add value if not exists 'receipt_uploaded';
alter type appointment_event_type add value if not exists 'receipt_rejected';
alter type appointment_event_type add value if not exists 'receipt_deleted';
alter type appointment_event_type add value if not exists 'upload_link_issued';
alter type appointment_event_type add value if not exists 'refund_recorded';
alter type appointment_event_type add value if not exists 'retention_changed';

create type receipt_status as enum (
  'pending_verification', 'verified', 'rejected', 'deleted'
);

-- ---------------------------------------------------------------------
-- 2. appointments: closure timestamps, retention hold, required email
-- ---------------------------------------------------------------------
alter table appointments
  add column if not exists completed_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists retention_hold boolean not null default false,
  add column if not exists retention_hold_reason text,
  add column if not exists retention_hold_since timestamptz,
  add column if not exists dispute_resolved_at timestamptz;

alter table appointments
  add constraint appointments_hold_reason_len check (
    retention_hold_reason is null or char_length(retention_hold_reason) between 3 and 300
  );

-- Backfill closure timestamps for rows that already reached a terminal state
-- (before the triggers below exist, so nothing else fires).
update appointments
set closed_at = updated_at,
    completed_at = case when status = 'completed' then updated_at else null end
where closed_at is null
  and status in (
    'completed', 'no_show', 'cancelled_by_client', 'cancelled_by_business',
    'deposit_forfeited', 'expired'
  );

-- The customer's email is now the automatic notification channel, so every
-- NEW appointment must have one. A BEFORE INSERT trigger (rather than a CHECK
-- constraint) so rows created before this change stay updatable.
create or replace function appointments_require_email() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.email is null or btrim(new.email) = '' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger appointments_require_email_guard
  before insert on appointments
  for each row execute function appointments_require_email();

-- ---------------------------------------------------------------------
-- 3. payments: refund record + one verified deposit per appointment
-- ---------------------------------------------------------------------
alter table payments
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_amount_ars numeric(10, 2),
  add column if not exists refund_reference text,
  add column if not exists refund_recorded_by uuid references admin_profiles (id);

alter table payments
  add constraint payments_refund_coherent check (
    (refunded_at is null and refund_amount_ars is null)
    or (
      refunded_at is not null
      and refund_amount_ars is not null
      and refund_amount_ars > 0
      and refund_amount_ars <= amount_ars
    )
  ),
  add constraint payments_refund_reference_len check (
    refund_reference is null or char_length(refund_reference) <= 60
  );

-- Makes "a double click creates a single payment" a database guarantee, not
-- just an application convention.
create unique index payments_one_verified_deposit_idx
  on payments (appointment_id)
  where status = 'verified' and type = 'deposit';

-- ---------------------------------------------------------------------
-- 4. payment_receipts
-- ---------------------------------------------------------------------
create table payment_receipts (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments (id) on delete cascade,
  -- Object path inside the private `payment-receipts` bucket (random name, no
  -- personal data). Cleared when the file is deleted.
  storage_path text,
  status receipt_status not null default 'pending_verification',
  original_mime_type text,
  size_bytes integer,
  -- Operation reference typed by the client (optional, short).
  reference text,
  uploaded_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references admin_profiles (id),
  rejected_at timestamptz,
  rejected_by uuid references admin_profiles (id),
  rejection_reason text,
  payment_id uuid references payments (id) on delete set null,
  retention_until timestamptz,
  deleted_at timestamptz,
  deletion_attempts integer not null default 0,
  last_deletion_error text,
  last_deletion_attempt_at timestamptz,
  constraint payment_receipts_mime_allowed check (
    original_mime_type is null
    or original_mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint payment_receipts_size_range check (
    size_bytes is null or size_bytes between 1 and 5242880
  ),
  constraint payment_receipts_reference_len check (
    reference is null or char_length(reference) <= 60
  ),
  constraint payment_receipts_reason_len check (
    rejection_reason is null or char_length(rejection_reason) between 3 and 300
  ),
  constraint payment_receipts_attempts_nonneg check (deletion_attempts >= 0),
  constraint payment_receipts_error_len check (
    last_deletion_error is null or char_length(last_deletion_error) <= 300
  ),
  constraint payment_receipts_path_format check (
    storage_path is null or storage_path ~ '^r/[0-9a-f-]{36}\.(jpg|png|webp)$'
  ),
  constraint payment_receipts_state_coherent check (
    case status
      when 'pending_verification' then
        storage_path is not null and original_mime_type is not null
        and size_bytes is not null and deleted_at is null
        and verified_at is null and rejected_at is null
      when 'verified' then
        storage_path is not null and original_mime_type is not null
        and size_bytes is not null and deleted_at is null
        and verified_at is not null and verified_by is not null
        and rejected_at is null
      when 'rejected' then
        storage_path is not null and original_mime_type is not null
        and size_bytes is not null and deleted_at is null
        and rejected_at is not null and rejection_reason is not null
        and verified_at is null
      when 'deleted' then
        storage_path is null and original_mime_type is null
        and size_bytes is null and deleted_at is not null
    end
  )
);

create index payment_receipts_appointment_id_idx on payment_receipts (appointment_id);
create unique index payment_receipts_storage_path_idx
  on payment_receipts (storage_path) where storage_path is not null;
create index payment_receipts_pending_idx
  on payment_receipts (uploaded_at) where status = 'pending_verification';
create index payment_receipts_purge_idx
  on payment_receipts (retention_until)
  where storage_path is not null and retention_until is not null;
create index payment_receipts_verified_by_idx on payment_receipts (verified_by);
create index payment_receipts_rejected_by_idx on payment_receipts (rejected_by);
create index payment_receipts_payment_id_idx on payment_receipts (payment_id);

-- ---------------------------------------------------------------------
-- 5. payment_upload_tokens (hash only — the raw token only ever exists in the
--    email link the client receives)
-- ---------------------------------------------------------------------
create table payment_upload_tokens (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments (id) on delete cascade,
  token_hash text not null unique,
  -- Snapshot of appointments.deposit_due_at at issue time: the token expires
  -- together with the payment window, and a later re-approval (new window)
  -- never revives an old link.
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  revoked_at timestamptz,
  constraint payment_upload_tokens_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);

create index payment_upload_tokens_appointment_id_idx
  on payment_upload_tokens (appointment_id);

-- ---------------------------------------------------------------------
-- 6. email_outbox (idempotent, retryable notifications; no raw tokens and no
--    message bodies are stored — a retry re-renders from current data)
-- ---------------------------------------------------------------------
create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments (id) on delete set null,
  kind text not null check (kind in (
    'request_received', 'owner_new_request', 'request_approved',
    'receipt_received', 'owner_receipt_received', 'receipt_rejected',
    'appointment_confirmed', 'appointment_cancelled',
    'appointment_rescheduled', 'refund_recorded'
  )),
  recipient text not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider text,
  attempts integer not null default 1,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  sent_at timestamptz
);

create index email_outbox_appointment_id_idx on email_outbox (appointment_id);
create index email_outbox_failed_idx on email_outbox (created_at) where status <> 'sent';

-- ---------------------------------------------------------------------
-- 7. receipt_purge_runs (visibility into the daily purge)
-- ---------------------------------------------------------------------
create table receipt_purge_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('cron', 'admin')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  candidates integer not null default 0,
  deleted integer not null default 0,
  failed integer not null default 0,
  orphans_removed integer not null default 0,
  error text check (error is null or char_length(error) <= 300)
);

-- ---------------------------------------------------------------------
-- 8. RLS: deny by default, admin read-only
-- ---------------------------------------------------------------------
alter table payment_receipts enable row level security;
alter table payment_upload_tokens enable row level security;
alter table email_outbox enable row level security;
alter table receipt_purge_runs enable row level security;

create policy payment_receipts_admin_select on payment_receipts
  for select using (is_admin());
create policy email_outbox_admin_select on email_outbox
  for select using (is_admin());
create policy receipt_purge_runs_admin_select on receipt_purge_runs
  for select using (is_admin());
-- payment_upload_tokens: no policies at all (not even for admins).

-- Defense in depth on top of RLS: Supabase's default privileges would grant
-- these tables to anon/authenticated.
revoke all on payment_receipts, payment_upload_tokens, email_outbox, receipt_purge_runs
  from public, anon, authenticated;
grant select on payment_receipts, email_outbox, receipt_purge_runs to authenticated;

-- ---------------------------------------------------------------------
-- 9. Private storage bucket. Created here when the storage schema already
--    exists (hosted projects); for `supabase start` the same bucket is
--    declared in supabase/config.toml. No policy is ever added on
--    storage.objects for this bucket: only the server (service role) touches
--    it, and the admin panel reads files through short-lived signed URLs.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'payment-receipts', 'payment-receipts', false, 5242880,
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = 5242880,
          allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Closure tracking and retention (the agreed policy, in one place):
--     rejected receipt .......... 7 days after rejection
--     expired/abandoned request . 7 days after it expired
--     completed / cancelled /
--     no-show / forfeited ....... 30 days after the appointment closed
--     retention_hold ............ never purged while the hold is on
--     resolved dispute .......... kept until dispute_resolved_at + 180 days
-- ---------------------------------------------------------------------
create or replace function appointments_track_closure() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status in (
      'completed', 'no_show', 'cancelled_by_client', 'cancelled_by_business',
      'deposit_forfeited', 'expired'
    ) then
      new.closed_at := now();
      new.completed_at := case when new.status = 'completed' then now() else null end;
    else
      new.closed_at := null;
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger appointments_track_closure
  before update of status on appointments
  for each row execute function appointments_track_closure();

create or replace function recompute_receipt_retention(p_appointment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update payment_receipts r
  set retention_until = case
    when r.status = 'rejected' then greatest(
      r.rejected_at + interval '7 days',
      coalesce(a.dispute_resolved_at + interval '180 days', '-infinity'::timestamptz)
    )
    when a.closed_at is null then
      case
        when a.dispute_resolved_at is null then null
        else a.dispute_resolved_at + interval '180 days'
      end
    else greatest(
      a.closed_at + (case when a.status = 'expired' then interval '7 days' else interval '30 days' end),
      coalesce(a.dispute_resolved_at + interval '180 days', '-infinity'::timestamptz)
    )
  end
  from appointments a
  where a.id = p_appointment_id
    and r.appointment_id = a.id
    and r.status in ('pending_verification', 'verified', 'rejected');
end;
$$;

create or replace function appointments_after_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    -- Upload links only work while awaiting_deposit: confirming, expiring or
    -- cancelling invalidates every outstanding link.
    if new.status <> 'awaiting_deposit' then
      update payment_upload_tokens t
      set revoked_at = now()
      where t.appointment_id = new.id and t.revoked_at is null;
    end if;
    perform recompute_receipt_retention(new.id);
  end if;
  return null;
end;
$$;

create trigger appointments_after_status_change
  after update of status on appointments
  for each row execute function appointments_after_status_change();

-- ---------------------------------------------------------------------
-- 11. Slot occupancy: an awaiting_deposit appointment whose payment window
--     lapsed still holds its slot while a receipt that was registered inside
--     that window is waiting for the admin's decision (it must not expire — and
--     free the slot — just because the verification is slow). The rule is
--     written inline (not as a helper function) in public_availability() and
--     request_appointment() so each check runs in the same statement snapshot
--     as the slot lock.
-- ---------------------------------------------------------------------
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
$$;

create or replace function expire_overdue_deposits() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  with expired as (
    update appointments a
    set status = 'expired'
    where a.status = 'awaiting_deposit'
      and a.deposit_due_at < now()
      and not exists (
        select 1 from payment_receipts r
        where r.appointment_id = a.id and r.status = 'pending_verification'
          and r.uploaded_at <= a.deposit_due_at
      )
    returning a.id
  )
  insert into appointment_events (appointment_id, event_type, actor)
  select e.id, 'expired', 'system' from expired e;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Manual deposit entry (no receipt, e.g. cash at the shop). It refuses while a
-- receipt is waiting: that one must be confirmed or rejected from the receipt.
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
  if exists (
    select 1 from payment_receipts r
    where r.appointment_id = p_appointment_id and r.status = 'pending_verification'
  ) then
    raise exception 'RECEIPT_PENDING' using errcode = 'P0001';
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

-- ---------------------------------------------------------------------
-- 12. Upload tokens
-- ---------------------------------------------------------------------
-- Issued by the admin session right after approving (or when resending / after
-- rejecting a receipt). The server generates the random token, sends the raw
-- value only in the email, and passes just its SHA-256 hex hash here.
create or replace function admin_issue_upload_token(p_appointment_id uuid, p_token_hash text)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments%rowtype;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  select * into v_appt from appointments a where a.id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_appt.status <> 'awaiting_deposit' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if v_appt.deposit_due_at is null or v_appt.deposit_due_at <= now() then
    raise exception 'DEPOSIT_WINDOW_EXPIRED' using errcode = 'P0001';
  end if;

  update payment_upload_tokens t
  set revoked_at = now()
  where t.appointment_id = p_appointment_id
    and t.revoked_at is null
    and t.used_at is null;

  insert into payment_upload_tokens (appointment_id, token_hash, expires_at)
  values (p_appointment_id, p_token_hash, v_appt.deposit_due_at);

  insert into appointment_events (appointment_id, event_type, actor, admin_id)
  values (p_appointment_id, 'upload_link_issued', 'admin', auth.uid());

  return v_appt.deposit_due_at;
end;
$$;

-- Read-only view of what a token allows, for the upload page. Returns no row
-- for an unknown token. Never returns the owner's name, phone or address.
create or replace function get_upload_context(p_token_hash text)
returns table (
  ctx_appointment_id uuid,
  ctx_dog_name text,
  ctx_starts_at timestamptz,
  ctx_status appointment_status,
  ctx_deposit_amount_ars numeric,
  ctx_deposit_due_at timestamptz,
  ctx_token_state text,
  ctx_pending_receipts int,
  ctx_active_receipts int
)
language plpgsql security definer set search_path = public as $$
declare
  v_token payment_upload_tokens%rowtype;
  v_appt appointments%rowtype;
  v_slot_starts_at timestamptz;
  v_amount numeric;
  v_state text;
begin
  select * into v_token from payment_upload_tokens t where t.token_hash = p_token_hash;
  if not found then
    return;
  end if;

  select * into v_appt from appointments a where a.id = v_token.appointment_id;
  select s.starts_at into v_slot_starts_at from availability_slots s where s.id = v_appt.slot_id;
  select b.deposit_amount_ars into v_amount from business_settings b where b.id = true;

  if v_appt.status <> 'awaiting_deposit' then
    v_state := 'closed';
  elsif v_token.used_at is not null then
    v_state := 'used';
  elsif v_token.revoked_at is not null then
    v_state := 'revoked';
  elsif v_token.expires_at <= now()
    or v_appt.deposit_due_at is null
    or v_appt.deposit_due_at <= now() then
    v_state := 'expired';
  else
    v_state := 'valid';
  end if;

  return query
  select
    v_appt.id,
    v_appt.dog_name,
    v_slot_starts_at,
    v_appt.status,
    v_amount,
    v_appt.deposit_due_at,
    v_state,
    (select count(*)::int from payment_receipts r
      where r.appointment_id = v_appt.id and r.status = 'pending_verification'),
    (select count(*)::int from payment_receipts r
      where r.appointment_id = v_appt.id and r.status in ('pending_verification', 'verified'));
end;
$$;

-- Registers the files the client already uploaded to Storage (the server has
-- verified their real content) and consumes the token. All-or-nothing.
create or replace function register_payment_receipts(
  p_token_hash text,
  p_files jsonb,
  p_reference text default null
) returns table (reg_appointment_id uuid, reg_receipt_ids uuid[])
language plpgsql security definer set search_path = public as $$
declare
  v_appt_id uuid;
  v_appt appointments%rowtype;
  v_token payment_upload_tokens%rowtype;
  v_count int;
  v_active int;
  v_total int;
  v_ref text;
  v_file jsonb;
  v_path text;
  v_mime text;
  v_size int;
  v_ids uuid[] := '{}';
  v_new_id uuid;
begin
  if jsonb_typeof(p_files) is distinct from 'array' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(p_files);
  if v_count < 1 or v_count > 2 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  if v_ref is not null and char_length(v_ref) > 60 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  for v_file in select * from jsonb_array_elements(p_files) loop
    v_path := v_file ->> 'path';
    v_mime := v_file ->> 'mime';
    if jsonb_typeof(v_file -> 'size') is distinct from 'number'
      or coalesce(v_file ->> 'size', '') !~ '^[0-9]+$' then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;
    v_size := (v_file ->> 'size')::int;
    if v_path is null or v_path !~ '^r/[0-9a-f-]{36}\.(jpg|png|webp)$'
      or v_size < 1 or v_size > 5242880
      or not (
        (v_mime = 'image/jpeg' and v_path ~ '\.jpg$')
        or (v_mime = 'image/png' and v_path ~ '\.png$')
        or (v_mime = 'image/webp' and v_path ~ '\.webp$')
      ) then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;
  end loop;

  select t.appointment_id into v_appt_id
  from payment_upload_tokens t where t.token_hash = p_token_hash;
  if not found then
    raise exception 'TOKEN_INVALID' using errcode = 'P0001';
  end if;

  -- Lock order: appointment first, then its token (same as the admin RPCs).
  select * into v_appt from appointments a where a.id = v_appt_id for update;
  select * into v_token from payment_upload_tokens t where t.token_hash = p_token_hash for update;

  if v_appt.status <> 'awaiting_deposit' then
    raise exception 'NOT_AWAITING_DEPOSIT' using errcode = 'P0001';
  end if;
  if v_token.used_at is not null then
    raise exception 'TOKEN_USED' using errcode = 'P0001';
  end if;
  if v_token.revoked_at is not null then
    raise exception 'TOKEN_INVALID' using errcode = 'P0001';
  end if;
  if v_token.expires_at <= now()
    or v_appt.deposit_due_at is null
    or v_appt.deposit_due_at <= now() then
    raise exception 'TOKEN_EXPIRED' using errcode = 'P0001';
  end if;

  select count(*) into v_active
  from payment_receipts r
  where r.appointment_id = v_appt_id and r.status in ('pending_verification', 'verified');
  select count(*) into v_total
  from payment_receipts r
  where r.appointment_id = v_appt_id and r.status <> 'deleted';
  if v_active + v_count > 2 or v_total + v_count > 6 then
    raise exception 'TOO_MANY_RECEIPTS' using errcode = 'P0001';
  end if;

  for v_file in select * from jsonb_array_elements(p_files) loop
    insert into payment_receipts (appointment_id, storage_path, original_mime_type, size_bytes, reference)
    values (v_appt_id, v_file ->> 'path', v_file ->> 'mime', (v_file ->> 'size')::int, v_ref)
    returning payment_receipts.id into v_new_id;
    v_ids := v_ids || v_new_id;
  end loop;

  update payment_upload_tokens t set used_at = now() where t.id = v_token.id;

  insert into appointment_events (appointment_id, event_type, actor, note)
  values (v_appt_id, 'receipt_uploaded', 'system', v_count || ' archivo(s)');

  return query select v_appt_id, v_ids;
end;
$$;

-- ---------------------------------------------------------------------
-- 13. Admin decisions on receipts
-- ---------------------------------------------------------------------
-- Confirms the deposit: creates ONE verified payment for the expected amount,
-- verifies the pending receipts and moves the appointment to `confirmed`.
-- A second (double-click) call finds the appointment already confirmed and
-- fails with INVALID_TRANSITION; payments_one_verified_deposit_idx backs it up.
create or replace function admin_confirm_deposit(
  p_appointment_id uuid,
  p_reference text default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments%rowtype;
  v_amount numeric;
  v_ref text;
  v_payment_id uuid;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_appt from appointments a where a.id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_appt.status <> 'awaiting_deposit' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from payment_receipts r
    where r.appointment_id = p_appointment_id and r.status = 'pending_verification'
  ) then
    raise exception 'NO_PENDING_RECEIPT' using errcode = 'P0001';
  end if;

  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  if v_ref is not null and char_length(v_ref) > 60 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if v_ref is null then
    select r.reference into v_ref
    from payment_receipts r
    where r.appointment_id = p_appointment_id and r.reference is not null
    order by r.uploaded_at desc limit 1;
  end if;

  select b.deposit_amount_ars into v_amount from business_settings b where b.id = true;

  insert into payments (appointment_id, amount_ars, method, status, external_reference, verified_by, note)
  values (p_appointment_id, v_amount, 'bank_transfer', 'verified', v_ref, auth.uid(), p_note)
  returning payments.id into v_payment_id;

  update payment_receipts r
  set status = 'verified',
      verified_at = now(),
      verified_by = auth.uid(),
      payment_id = v_payment_id
  where r.appointment_id = p_appointment_id and r.status = 'pending_verification';

  update appointments set status = 'confirmed' where id = p_appointment_id;

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (p_appointment_id, 'deposit_recorded', 'admin', auth.uid(), p_note);

  return v_payment_id;
end;
$$;

-- Rejects the pending receipts (reason required). The appointment stays
-- awaiting_deposit; the server then issues a fresh upload link for the client.
create or replace function admin_reject_receipts(p_appointment_id uuid, p_reason text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_count int;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_appt from appointments a where a.id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_appt.status <> 'awaiting_deposit' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  update payment_receipts r
  set status = 'rejected',
      rejected_at = now(),
      rejected_by = auth.uid(),
      rejection_reason = v_reason
  where r.appointment_id = p_appointment_id and r.status = 'pending_verification';
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'NO_PENDING_RECEIPT' using errcode = 'P0001';
  end if;

  perform recompute_receipt_retention(p_appointment_id);

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (p_appointment_id, 'receipt_rejected', 'admin', auth.uid(), v_reason);

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 14. Retention hold, disputes and refunds
-- ---------------------------------------------------------------------
create or replace function admin_set_retention_hold(
  p_appointment_id uuid,
  p_hold boolean,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_hold and (v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 300) then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;

  perform 1 from appointments a where a.id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  update appointments a
  set retention_hold = p_hold,
      retention_hold_reason = case when p_hold then v_reason else null end,
      retention_hold_since = case when p_hold then now() else null end
  where a.id = p_appointment_id;

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (
    p_appointment_id, 'retention_changed', 'admin', auth.uid(),
    case when p_hold then 'Eliminación suspendida: ' || v_reason else 'Eliminación reanudada' end
  );
end;
$$;

-- Closes a claim/refund dispute: lifts the hold and keeps the receipts for
-- 180 more days from today.
create or replace function admin_resolve_dispute(p_appointment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  perform 1 from appointments a where a.id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  update appointments a
  set retention_hold = false,
      retention_hold_reason = null,
      retention_hold_since = null,
      dispute_resolved_at = now()
  where a.id = p_appointment_id;

  perform recompute_receipt_retention(p_appointment_id);

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (p_appointment_id, 'retention_changed', 'admin', auth.uid(), 'Reclamo resuelto: se conserva 180 días');
end;
$$;

create or replace function admin_record_refund(
  p_appointment_id uuid,
  p_amount_ars numeric,
  p_reference text default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if v_ref is not null and char_length(v_ref) > 60 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  perform 1 from appointments a where a.id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_payment
  from payments p
  where p.appointment_id = p_appointment_id and p.status = 'verified' and p.type = 'deposit'
  limit 1;
  if not found then
    raise exception 'NO_VERIFIED_PAYMENT' using errcode = 'P0001';
  end if;
  if v_payment.refunded_at is not null then
    raise exception 'ALREADY_REFUNDED' using errcode = 'P0001';
  end if;
  if p_amount_ars is null or p_amount_ars <= 0 or p_amount_ars > v_payment.amount_ars then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  update payments p
  set refunded_at = now(),
      refund_amount_ars = p_amount_ars,
      refund_reference = v_ref,
      refund_recorded_by = auth.uid()
  where p.id = v_payment.id;

  insert into appointment_events (appointment_id, event_type, actor, admin_id, note)
  values (p_appointment_id, 'refund_recorded', 'admin', auth.uid(), p_note);

  return v_payment.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 15. Purge support (service role only — used by the Edge Function and by the
--     admin's manual run). These functions never touch Storage: the caller
--     removes the object through the Storage API first and only then calls
--     mark_receipt_deleted.
-- ---------------------------------------------------------------------
create or replace function purge_candidates(p_limit int default 50, p_max_attempts int default 5)
returns table (cand_receipt_id uuid, cand_storage_path text)
language sql stable security definer set search_path = public as $$
  select r.id, r.storage_path
  from payment_receipts r
  join appointments a on a.id = r.appointment_id
  where r.storage_path is not null
    and r.status <> 'deleted'
    and r.retention_until is not null
    and r.retention_until <= now()
    and not a.retention_hold
    and r.deletion_attempts < p_max_attempts
  order by r.retention_until
  limit least(greatest(p_limit, 1), 500);
$$;

create or replace function mark_receipt_deleted(p_receipt_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_appointment_id uuid;
begin
  update payment_receipts r
  set status = 'deleted',
      deleted_at = now(),
      storage_path = null,
      original_mime_type = null,
      size_bytes = null,
      reference = null,
      last_deletion_error = null
  where r.id = p_receipt_id and r.status <> 'deleted'
  returning r.appointment_id into v_appointment_id;

  if v_appointment_id is null then
    return false;
  end if;

  insert into appointment_events (appointment_id, event_type, actor)
  values (v_appointment_id, 'receipt_deleted', 'system');
  return true;
end;
$$;

create or replace function mark_receipt_deletion_failed(p_receipt_id uuid, p_error text)
returns void
language sql security definer set search_path = public as $$
  update payment_receipts r
  set deletion_attempts = r.deletion_attempts + 1,
      last_deletion_error = left(coalesce(p_error, 'error desconocido'), 300),
      last_deletion_attempt_at = now()
  where r.id = p_receipt_id and r.status <> 'deleted';
$$;

-- Lets the admin re-arm receipts that exhausted their retries.
create or replace function admin_reset_receipt_deletion_attempts() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  update payment_receipts r
  set deletion_attempts = 0
  where r.status <> 'deleted' and r.deletion_attempts > 0;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function purge_operational_records() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_total int := 0;
  v_n int;
begin
  delete from payment_upload_tokens t where t.expires_at < now() - interval '30 days';
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  delete from email_outbox o where o.status = 'sent' and o.created_at < now() - interval '90 days';
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  delete from receipt_purge_runs p where p.started_at < now() - interval '180 days';
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  return v_total;
end;
$$;

create or replace function record_purge_run(
  p_source text,
  p_started_at timestamptz,
  p_candidates int,
  p_deleted int,
  p_failed int,
  p_orphans int,
  p_error text default null
) returns uuid
language sql security definer set search_path = public as $$
  insert into receipt_purge_runs (source, started_at, finished_at, candidates, deleted, failed, orphans_removed, error)
  values (p_source, p_started_at, now(), p_candidates, p_deleted, p_failed, p_orphans, left(p_error, 300))
  returning receipt_purge_runs.id;
$$;

-- ---------------------------------------------------------------------
-- 16. Email outbox (service role only)
-- ---------------------------------------------------------------------
-- Atomically claims the right to send one logical email. Returns claimed=false
-- when it was already sent, or another worker is mid-send (stale after 10 min).
create or replace function email_outbox_claim(
  p_key text,
  p_kind text,
  p_appointment_id uuid,
  p_recipient text
) returns table (outbox_id uuid, claimed boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_row email_outbox%rowtype;
begin
  insert into email_outbox (appointment_id, kind, recipient, idempotency_key)
  values (p_appointment_id, p_kind, p_recipient, p_key)
  on conflict (idempotency_key) do nothing
  returning email_outbox.id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  select * into v_row from email_outbox o where o.idempotency_key = p_key for update;

  if v_row.status = 'failed'
    or (v_row.status = 'pending' and v_row.last_attempt_at < now() - interval '10 minutes') then
    update email_outbox o
    set status = 'pending', attempts = o.attempts + 1, last_attempt_at = now()
    where o.id = v_row.id;
    return query select v_row.id, true;
    return;
  end if;

  return query select v_row.id, false;
end;
$$;

create or replace function email_outbox_complete(
  p_outbox_id uuid,
  p_ok boolean,
  p_provider text default null,
  p_error text default null
) returns void
language sql security definer set search_path = public as $$
  update email_outbox o
  set status = case when p_ok then 'sent' else 'failed' end,
      provider = p_provider,
      sent_at = case when p_ok then now() else null end,
      last_error = case when p_ok then null else left(coalesce(p_error, 'error desconocido'), 300) end
  where o.id = p_outbox_id;
$$;

-- ---------------------------------------------------------------------
-- 17. Public receipt state by tracking code (anon). Reveals only whether a
--     receipt is pending/verified/rejected — nothing personal.
-- ---------------------------------------------------------------------
create or replace function get_appointment_receipt_status(p_code text, p_client_key text default 'unknown')
returns table (receipt_state text)
language plpgsql security definer set search_path = public as $$
begin
  perform enforce_rate_limit('receipt-status:' || p_client_key, 10, interval '1 minute');

  return query
  select coalesce(
    (
      select r.status::text
      from payment_receipts r
      join appointments a on a.id = r.appointment_id
      where a.code = upper(trim(p_code)) and r.status <> 'deleted'
      order by r.uploaded_at desc
      limit 1
    ),
    'none'
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 18. request_appointment: the current version (see
--     20261001194349_fix_request_appointment_pgcrypto.sql) with exactly three
--     changes — the customer's email is required, the inline expiry sweep
--     skips an appointment whose receipt is waiting for the admin, and slot /
--     day-cap occupancy use the same inline rule as public_availability().
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
  v_constraint text;
begin
  perform enforce_rate_limit('booking:' || p_client_key, 5, interval '10 minutes');

  -- Lazy-expiration sweep so a lapsed awaiting_deposit row can never block a
  -- genuinely free slot behind the unique index below.
  with expired as (
    update appointments a
    set status = 'expired'
    where a.status = 'awaiting_deposit'
      and a.deposit_due_at < now()
      and not exists (
        select 1 from payment_receipts r
        where r.appointment_id = a.id and r.status = 'pending_verification'
          and r.uploaded_at <= a.deposit_due_at
      )
    returning a.id
  )
  insert into appointment_events (appointment_id, event_type, actor)
  select e.id, 'expired', 'system' from expired e;

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
  if p_email is null or btrim(p_email) = ''
    or char_length(p_email) > 254
    or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
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
    exit when not exists (
      select 1
      from appointments as a
      where a.code = v_code
    );
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception 'CODE_GENERATION_FAILED' using errcode = 'P0001';
    end if;
  end loop;

  begin
  insert into appointments (
    code, slot_id, dog_name, size_bucket, breed, coat_state, service_package, notes,
    logistics_mode, neighborhood, pickup_address, owner_name, phone_e164, email, consents, status
  ) values (
    v_code, p_slot_id, p_dog_name, p_size_bucket, p_breed, p_coat_state, p_service_package, p_notes,
    p_logistics_mode, p_neighborhood, p_pickup_address, p_owner_name, p_phone_e164, p_email,
    p_consents, 'pending_review'
  ) returning id into v_appointment_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'appointments_active_per_slot_idx' then
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
    end if;
    raise;
  end;

  insert into appointment_events (appointment_id, event_type, actor)
  values (v_appointment_id, 'created', 'system');

  return query select v_code, v_appointment_id, v_slot.starts_at;
end;
$$;
grant execute on function request_appointment(
  uuid, text, size_bucket, text, coat_state, service_package, text, logistics_mode, text, text, text, text, text, jsonb, text
) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 19. Function privileges. Supabase grants EXECUTE on new public functions to
--     anon and authenticated by default, so each one is locked down
--     explicitly: internal helpers and triggers get no grant at all, the
--     server-side functions go to service_role only, the admin functions to
--     authenticated (each also checks is_admin()), and the one public lookup
--     to anon.
-- ---------------------------------------------------------------------
-- internal helpers and trigger functions: callable only by the function owner
revoke all on function appointments_require_email() from public, anon, authenticated;
revoke all on function appointments_track_closure() from public, anon, authenticated;
revoke all on function appointments_after_status_change() from public, anon, authenticated;
revoke all on function recompute_receipt_retention(uuid) from public, anon, authenticated;

-- server-side (service_role only)
revoke all on function get_upload_context(text) from public, anon, authenticated;
revoke all on function register_payment_receipts(text, jsonb, text) from public, anon, authenticated;
revoke all on function purge_candidates(int, int) from public, anon, authenticated;
revoke all on function mark_receipt_deleted(uuid) from public, anon, authenticated;
revoke all on function mark_receipt_deletion_failed(uuid, text) from public, anon, authenticated;
revoke all on function purge_operational_records() from public, anon, authenticated;
revoke all on function record_purge_run(text, timestamptz, int, int, int, int, text)
  from public, anon, authenticated;
revoke all on function email_outbox_claim(text, text, uuid, text) from public, anon, authenticated;
revoke all on function email_outbox_complete(uuid, boolean, text, text) from public, anon, authenticated;

grant execute on function get_upload_context(text) to service_role;
grant execute on function register_payment_receipts(text, jsonb, text) to service_role;
grant execute on function purge_candidates(int, int) to service_role;
grant execute on function mark_receipt_deleted(uuid) to service_role;
grant execute on function mark_receipt_deletion_failed(uuid, text) to service_role;
grant execute on function purge_operational_records() to service_role;
grant execute on function record_purge_run(text, timestamptz, int, int, int, int, text) to service_role;
grant execute on function email_outbox_claim(text, text, uuid, text) to service_role;
grant execute on function email_outbox_complete(uuid, boolean, text, text) to service_role;

-- admin (authenticated; every function verifies is_admin() itself)
revoke all on function admin_issue_upload_token(uuid, text) from public, anon, authenticated;
revoke all on function admin_confirm_deposit(uuid, text, text) from public, anon, authenticated;
revoke all on function admin_reject_receipts(uuid, text) from public, anon, authenticated;
revoke all on function admin_set_retention_hold(uuid, boolean, text) from public, anon, authenticated;
revoke all on function admin_resolve_dispute(uuid) from public, anon, authenticated;
revoke all on function admin_record_refund(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function admin_reset_receipt_deletion_attempts() from public, anon, authenticated;
revoke all on function admin_record_deposit_payment(uuid, numeric, payment_method, text, text)
  from public, anon, authenticated;
revoke all on function expire_overdue_deposits() from public, anon, authenticated;

grant execute on function admin_issue_upload_token(uuid, text) to authenticated;
grant execute on function admin_confirm_deposit(uuid, text, text) to authenticated;
grant execute on function admin_reject_receipts(uuid, text) to authenticated;
grant execute on function admin_set_retention_hold(uuid, boolean, text) to authenticated;
grant execute on function admin_resolve_dispute(uuid) to authenticated;
grant execute on function admin_record_refund(uuid, numeric, text, text) to authenticated;
grant execute on function admin_reset_receipt_deletion_attempts() to authenticated;
grant execute on function admin_record_deposit_payment(uuid, numeric, payment_method, text, text)
  to authenticated;
grant execute on function expire_overdue_deposits() to authenticated;

-- public
revoke all on function get_appointment_receipt_status(text, text) from public, anon, authenticated;
grant execute on function get_appointment_receipt_status(text, text) to anon, authenticated;

-- replaced public functions keep their existing public grants
grant execute on function public_availability() to anon, authenticated;
grant execute on function request_appointment(
  uuid, text, size_bucket, text, coat_state, service_package, text, logistics_mode, text, text, text, text, text, jsonb, text
) to anon, authenticated;
