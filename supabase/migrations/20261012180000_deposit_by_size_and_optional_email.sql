-- 1. The customer is contacted by WhatsApp, so the booking form no longer asks
--    for an email. The guard that required one on every booking steps aside
--    (the format check on a non-empty email stays in request_appointment and in
--    the appointments_email_format constraint).
create or replace function appointments_require_email() returns trigger
language plpgsql set search_path = public as $$
begin
  return new;
end;
$$;

-- 2. The deposit is 50% of the lower bound of the price range of the dog's size
--    (owner request, 2026-10-12). Keep in sync with businessConfig.deposit.bySize.
alter table business_settings
  add column if not exists deposit_amounts_ars jsonb not null
  default '{"pequeno": 15000, "mediano": 20000, "grande": 30000}'::jsonb;

create or replace function deposit_amount_for(p_size size_bucket)
returns numeric
language sql stable set search_path = public as $$
  select coalesce(
    (select (b.deposit_amounts_ars ->> p_size::text)::numeric
       from business_settings b where b.id = true),
    20000
  );
$$;

grant execute on function deposit_amount_for(size_bucket) to anon, authenticated, service_role;

-- 3. Use it wherever the single global amount was read. The bodies are patched
--    from the live definitions so nothing else in them changes; each patch must
--    match exactly once or the migration aborts.
create or replace function pg_temp.patch_function(
  p_signature regprocedure,
  p_old text,
  p_new text
) returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_signature);
begin
  if v_def is null or position(p_old in v_def) = 0 then
    raise exception 'patch target not found in %', p_signature;
  end if;
  if position(p_old in substr(v_def, position(p_old in v_def) + 1)) > 0 then
    raise exception 'patch target is ambiguous in %', p_signature;
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

select pg_temp.patch_function(
  'get_upload_context(text)'::regprocedure,
  'select b.deposit_amount_ars into v_amount from business_settings b where b.id = true;',
  'v_amount := deposit_amount_for(v_appt.size_bucket);'
);

select pg_temp.patch_function(
  'admin_confirm_deposit(uuid, text, text)'::regprocedure,
  'select b.deposit_amount_ars into v_amount from business_settings b where b.id = true;',
  'v_amount := deposit_amount_for(v_appt.size_bucket);'
);

select pg_temp.patch_function(
  'get_appointment_status(text, text)'::regprocedure,
  '(select bs.deposit_amount_ars from business_settings bs where bs.id = true)',
  'deposit_amount_for(a.size_bucket)'
);

select pg_temp.patch_function(
  (select p.oid::regprocedure
     from pg_proc p
    where p.proname = 'admin_create_appointment'
      and p.pronamespace = 'public'::regnamespace),
  'v_id, v_settings.deposit_amount_ars, p_deposit_method',
  'v_id, deposit_amount_for(p_size_bucket), p_deposit_method'
);
