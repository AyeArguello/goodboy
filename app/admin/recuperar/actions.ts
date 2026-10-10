"use server";

import { siteUrl } from "@/lib/config/business";
import { getServerEnv } from "@/lib/env/server";
import { getClientKey } from "@/lib/security/clientKey";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

export type RecoveryResult = { ok: true } | { ok: false; error: string };

export async function requestAdminPasswordRecovery(
  rawEmail: string,
): Promise<RecoveryResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Ingresá un correo válido." };
  }

  try {
    const service = getServiceSupabaseClient();
    const clientKey = await getClientKey();
    const { error } = await service.rpc("enforce_rate_limit", {
      p_key: `admin-password-recovery:ip:${clientKey}`,
      p_max_per_window: 3,
      p_window: "30 minutes",
    });
    if (error) throw error;
  } catch (error) {
    console.error("Admin password-recovery pre-limit unavailable", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return {
      ok: false,
      error: "No pudimos procesar la solicitud. Intentá más tarde.",
    };
  }

  const { ADMIN_EMAIL_ALLOWLIST } = getServerEnv();
  if (!ADMIN_EMAIL_ALLOWLIST.includes(email)) return { ok: true };

  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/admin/auth/reset`,
  });

  if (error) {
    // Supabase throttles repeated recovery emails. A recent request may have
    // succeeded already, so keep the same neutral response used for unknown
    // addresses instead of showing a misleading delivery failure or leaking
    // whether this email belongs to an account.
    if (error.status === 429) return { ok: true };

    console.error("Admin password-recovery delivery failed", {
      code: error.code,
      status: error.status,
    });
    return {
      ok: false,
      error: "No pudimos enviar el correo. Intentá más tarde.",
    };
  }

  return { ok: true };
}
