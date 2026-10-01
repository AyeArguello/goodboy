-- Closes the function_search_path_mutable advisory raised against
-- is_allowed_slot_time()/max_active_per_day_for() by the v3 hardening
-- migration. Both are `language sql stable`, not SECURITY DEFINER, and
-- reference no table — only built-ins (extract/to_char), which always
-- resolve via pg_catalog regardless of search_path — so `set search_path =
-- ''` is safe and closes the mutable-search-path WARN without needing
-- `public` in scope.

create or replace function is_allowed_slot_time(p_starts_at timestamptz, p_timezone text)
returns boolean
language sql stable set search_path = '' as $$
  select case extract(isodow from (p_starts_at at time zone p_timezone))::int
    when 6 then to_char(p_starts_at at time zone p_timezone, 'HH24:MI') = '11:00'
    when 7 then false
    else to_char(p_starts_at at time zone p_timezone, 'HH24:MI') in ('09:00', '11:30', '13:30')
  end;
$$;

create or replace function max_active_per_day_for(p_starts_at timestamptz, p_timezone text)
returns int
language sql stable set search_path = '' as $$
  select case extract(isodow from (p_starts_at at time zone p_timezone))::int
    when 6 then 1
    when 7 then 0
    else 3
  end;
$$;
