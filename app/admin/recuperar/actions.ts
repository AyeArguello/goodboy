"use server";

import { siteUrl } from "@/lib/config/business";
import { getServerEnv } from "@/lib/env/server";
import { getClientKey } from "@/lib/security/clientKey";
import { hashClientKey } from "@/lib/security/rateLimitKey";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

export type RecoveryResult = { ok: true } | { ok: false; error: string };

const COOLDOWN_MESSAGE =
  "Ya te enviamos un enlace hace instantes. Esperá un minuto antes de pedir otro y revisá también spam.";

export async function requestAdminPasswordRecovery(
  rawEmail: string,
): Promise<RecoveryResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Ingresá un correo válido." };
  }

  const service = getServiceSupabaseClient();
  try {
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

  // One request per address per minute, the same window Supabase enforces. It
  // is applied to every address (allowlisted or not) before anything else, so
  // the answer never reveals which addresses belong to the panel, and the
  // owner is told to wait instead of seeing a "sent" that Supabase would drop.
  try {
    const { error } = await service.rpc("enforce_rate_limit", {
      p_key: `admin-password-recovery:email:${hashClientKey(email)}`,
      p_max_per_window: 1,
      p_window: "60 seconds",
    });
    if (error) {
      if (error.message.includes("RATE_LIMITED")) {
        return { ok: false, error: COOLDOWN_MESSAGE };
      }
      throw error;
    }
  } catch (error) {
    console.error("Admin password-recovery cooldown unavailable", {
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
    // A throttled or failed send is reported as such. Pretending it succeeded
    // (as an earlier version did for HTTP 429) left the owner waiting for an
    // email Supabase never sent.
    console.error("Admin password-recovery delivery failed", {
      code: error.code,
      status: error.status,
    });
    return {
      ok: false,
      error:
        error.status === 429
          ? "Se alcanzó el límite de envíos. Usá el último correo que recibiste o probá de nuevo en un rato."
          : "No pudimos enviar el correo. Intentá más tarde.",
    };
  }

  return { ok: true };
}
