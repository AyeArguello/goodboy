"use server";

import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type PasswordUpdateResult = { ok: true } | { ok: false; error: string };

function passwordProblem(password: string): string | null {
  if (password.length < 14) return "Usá al menos 14 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password))
    return "Incluí mayúsculas y minúsculas.";
  if (!/\d/.test(password)) return "Incluí al menos un número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Incluí al menos un símbolo.";
  return null;
}

export async function updateAdminPassword(
  password: string,
  confirmation: string,
): Promise<PasswordUpdateResult> {
  const cookieStore = await cookies();
  if (cookieStore.get("admin-password-recovery")?.value !== "allowed") {
    return {
      ok: false,
      error: "El enlace de recuperación venció. Solicitá uno nuevo.",
    };
  }

  if (password !== confirmation) {
    return { ok: false, error: "Las contraseñas no coinciden." };
  }
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };

  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  const { ADMIN_EMAIL_ALLOWLIST } = getServerEnv();
  if (!user || !email || !ADMIN_EMAIL_ALLOWLIST.includes(email)) {
    return {
      ok: false,
      error: "El enlace de recuperación no es válido.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      ok: false,
      error: "No pudimos guardar la contraseña. Probá con una diferente.",
    };
  }

  cookieStore.delete("admin-password-recovery");
  await supabase.auth.signOut({ scope: "global" });
  return { ok: true };
}
