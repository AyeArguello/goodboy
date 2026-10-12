-- Every mode except 'self' involves a trip, so it needs a barrio and an address.
alter table appointments drop constraint if exists pickup_requires_address;
alter table appointments add constraint pickup_requires_address check (
  logistics_mode = 'self' or (neighborhood is not null and pickup_address is not null)
);

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
  $old$p_logistics_mode = 'pickup' and (p_neighborhood is null$old$,
  $new$p_logistics_mode <> 'self' and (p_neighborhood is null$new$
);

select pg_temp.patch_function(
  (select p.oid::regprocedure from pg_proc p
    where p.proname = 'admin_create_appointment' and p.pronamespace = 'public'::regnamespace),
  $old$p_logistics_mode = 'pickup'$old$,
  $new$p_logistics_mode <> 'self'$new$
);
