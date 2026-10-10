"use server";

import { revalidatePath } from "next/cache";
import { getServerEnv } from "@/lib/env/server";
import { getClientKey } from "@/lib/security/clientKey";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminLoginResult = { ok: true } | { ok: false; error: string };

const INVALID_CREDENTIALS = "Correo o contraseña incorrectos.";
const TEMPORARY_ERROR =
  "No pudimos iniciar sesión. Esperá unos minutos y volvé a intentarlo.";

/**
 * Password login for the single-owner admin panel.
 *
 * The password is sent only to Supabase Auth and is never logged or stored.
 * The client address is HMACed before the private rate limit is checked, only
 * allowlisted emails are submitted to Auth, and every invalid-credential path
 * returns the same public message. RLS and admin RPCs still authorize through
 * the server-created admin_profiles row rather than trusting the form alone.
 */
export async function loginAdmin(
  rawEmail: string,
  rawPassword: string,
): Promise<AdminLoginResult> {
  const email = rawEmail.trim().toLowerCase();
  const password = rawPassword;

  if (!email || !email.includes("@") || !password || password.length > 256) {
    return { ok: false, error: INVALID_CREDENTIALS };
  }

  let service: ReturnType<typeof getServiceSupabaseClient>;
  try {
    service = getServiceSupabaseClient();
    const clientKey = await getClientKey();
    const { error } = await service.rpc("enforce_rate_limit", {
      p_key: `admin-password-login:ip:${clientKey}`,
      p_max_per_window: 8,
      p_window: "15 minutes",
    });
    if (error) {
      if (error.message.includes("RATE_LIMITED")) {
        return { ok: false, error: TEMPORARY_ERROR };
      }
      throw error;
    }
  } catch (error) {
    // Password endpoints fail closed when the private limiter is unavailable.
    // Supabase also has provider-side Auth limits, but this guard must not be
    // silently skipped on a brute-force-sensitive endpoint.
    console.error("Admin password-login pre-limit unavailable", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return { ok: false, error: TEMPORARY_ERROR };
  }

  const { ADMIN_EMAIL_ALLOWLIST } = getServerEnv();
  if (!ADMIN_EMAIL_ALLOWLIST.includes(email)) {
    return { ok: false, error: INVALID_CREDENTIALS };
  }

  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  const signedInEmail = data.user?.email?.toLowerCase();
  if (error || !data.user || signedInEmail !== email) {
    return { ok: false, error: INVALID_CREDENTIALS };
  }

  const { data: existingProfile, error: profileReadError } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileReadError) {
    await supabase.auth.signOut();
    return { ok: false, error: TEMPORARY_ERROR };
  }

  if (!existingProfile) {
    const { error: profileError } = await service
      .from("admin_profiles")
      .upsert({ id: data.user.id, email });
    if (profileError) {
      await supabase.auth.signOut();
      console.error("Admin profile bootstrap failed", {
        code: profileError.code,
      });
      return { ok: false, error: TEMPORARY_ERROR };
    }
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}
