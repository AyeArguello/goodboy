/**
 * Production build gate for secrets and infrastructure config. Pure and
 * dependency-free on purpose: `next.config.ts` can't import `lib/env/server.ts`
 * (it carries the `server-only` guard), so this reads a plain env object
 * instead. Never include a value in a message — only the variable name.
 */

export const DEV_SUPABASE_ANON_KEY = "local-dev-anon-key";
export const DEV_SUPABASE_SERVICE_ROLE_KEY = "local-dev-service-role-key";
export const DEV_RATE_LIMIT_HMAC_SECRET = "local-dev-hmac-secret";
export const MIN_RATE_LIMIT_HMAC_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);
const EMAIL_PATTERN = /^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function checkSecret(
  name: string,
  value: string,
  devDefault: string,
  problems: string[],
): void {
  if (value.length === 0) {
    problems.push(`${name} no está definida.`);
  } else if (value === devDefault) {
    problems.push(`${name} sigue en el valor de desarrollo.`);
  } else if (/\s/.test(value)) {
    problems.push(`${name} contiene espacios o saltos de línea.`);
  }
}

export function collectProductionEnvProblems(env: Env): string[] {
  const problems: string[] = [];

  const siteUrl = clean(env.NEXT_PUBLIC_SITE_URL);
  if (siteUrl.length === 0) {
    problems.push("NEXT_PUBLIC_SITE_URL no está definida.");
  } else {
    const parsed = parseUrl(siteUrl);
    if (!parsed || parsed.protocol !== "https:") {
      problems.push(
        "NEXT_PUBLIC_SITE_URL debe ser una URL https:// válida (dominio de producción).",
      );
    }
  }

  const supabaseUrl = clean(env.NEXT_PUBLIC_SUPABASE_URL);
  if (supabaseUrl.length === 0) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL no está definida.");
  } else {
    const parsed = parseUrl(supabaseUrl);
    if (!parsed || parsed.protocol !== "https:") {
      problems.push(
        "NEXT_PUBLIC_SUPABASE_URL debe ser una URL https:// válida del proyecto Supabase.",
      );
    } else if (LOCAL_HOSTS.has(parsed.hostname)) {
      problems.push(
        "NEXT_PUBLIC_SUPABASE_URL apunta a un host local, no a un proyecto Supabase real.",
      );
    }
  }

  checkSecret(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    clean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    DEV_SUPABASE_ANON_KEY,
    problems,
  );
  checkSecret(
    "SUPABASE_SERVICE_ROLE_KEY",
    clean(env.SUPABASE_SERVICE_ROLE_KEY),
    DEV_SUPABASE_SERVICE_ROLE_KEY,
    problems,
  );

  const allowlist = clean(env.ADMIN_EMAIL_ALLOWLIST)
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (allowlist.length === 0) {
    problems.push(
      "ADMIN_EMAIL_ALLOWLIST está vacía (nadie podría entrar al panel).",
    );
  } else if (allowlist.some((e) => !EMAIL_PATTERN.test(e))) {
    problems.push(
      "ADMIN_EMAIL_ALLOWLIST contiene entradas que no son correos válidos (separar con comas).",
    );
  }

  const hmacSecret = clean(env.RATE_LIMIT_HMAC_SECRET);
  checkSecret(
    "RATE_LIMIT_HMAC_SECRET",
    hmacSecret,
    DEV_RATE_LIMIT_HMAC_SECRET,
    problems,
  );
  if (
    hmacSecret.length > 0 &&
    hmacSecret !== DEV_RATE_LIMIT_HMAC_SECRET &&
    hmacSecret.length < MIN_RATE_LIMIT_HMAC_SECRET_LENGTH
  ) {
    problems.push(
      `RATE_LIMIT_HMAC_SECRET es demasiado corto (mínimo ${MIN_RATE_LIMIT_HMAC_SECRET_LENGTH} caracteres).`,
    );
  }

  return problems;
}

export function assertProductionEnv(env: Env): void {
  const problems = collectProductionEnvProblems(env);
  if (problems.length > 0) {
    throw new Error(
      [
        "El build de producción se detuvo: faltan datos de configuración obligatorios.",
        ...problems.map((p) => `  - ${p}`),
      ].join("\n"),
    );
  }
}
