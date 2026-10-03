-- enforce_rate_limit is internal: request_appointment, get_appointment_status
-- and the other SECURITY DEFINER functions call it as the function owner, and
-- the Next.js server calls it with the service role. It must not be callable
-- by anonymous or signed-in users through /rest/v1/rpc, where a caller could
-- spend or fill other callers' rate-limit keys.
--
-- 20260101000006_v3_hardening.sql revoked EXECUTE from PUBLIC only, which does
-- not remove the direct grants Supabase's default privileges give to anon and
-- authenticated. Only the privileges change: the implementation, SECURITY
-- DEFINER and search_path are untouched.
revoke execute on function public.enforce_rate_limit(text, integer, interval)
  from public, anon, authenticated;

grant execute on function public.enforce_rate_limit(text, integer, interval)
  to service_role;
