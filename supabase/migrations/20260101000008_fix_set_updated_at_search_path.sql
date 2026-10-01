-- Closes the last function_search_path_mutable advisory, raised against
-- set_updated_at() since the original schema migration. Doesn't touch the
-- function body (no create or replace) — just locks its search_path.
alter function public.set_updated_at()
  set search_path = '';
