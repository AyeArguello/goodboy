-- The public booking form no longer asks for an email (the customer is reached
-- by WhatsApp), but request_appointment still rejected a missing one with
-- VALIDATION_ERROR, so every booking from the web failed. The email is now
-- optional; when present it must still be a valid address.
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
  (select p.oid::regprocedure from pg_proc p
    where p.proname = 'request_appointment' and p.pronamespace = 'public'::regnamespace),
  $old$  if p_email is null or btrim(p_email) = ''
    or char_length(p_email) > 254
    or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then$old$,
  $new$  if p_email is not null and btrim(p_email) <> '' and (
    char_length(p_email) > 254
    or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then$new$
);
