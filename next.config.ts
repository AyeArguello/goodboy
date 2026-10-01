import type { NextConfig } from "next";
import { assertProductionBusinessConfig } from "./lib/config/business";

// Fails the build/boot loudly if NAP, WhatsApp, business hours, cancellation
// policy or the production domain are still placeholders. See
// docs/assumptions.md and lib/config/business.ts. Two more production-only
// gates live here rather than inside lib/env/server.ts: that module carries
// the `server-only` guard (correctly, since it's imported from actual server
// code too), and Next's own config loader turns out to enforce that boundary
// for next.config.ts as well — so these two checks read `process.env`
// directly instead, duplicating a couple of lines of parsing rather than
// importing the guarded module.
if (process.env.NODE_ENV === "production") {
  assertProductionBusinessConfig();

  const problems: string[] = [];
  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (allowlist.length === 0) {
    problems.push(
      "ADMIN_EMAIL_ALLOWLIST está vacío (nadie podría entrar al panel).",
    );
  }
  const rateLimitSecret =
    process.env.RATE_LIMIT_HMAC_SECRET || "local-dev-hmac-secret";
  if (rateLimitSecret === "local-dev-hmac-secret") {
    problems.push(
      "RATE_LIMIT_HMAC_SECRET sigue en el valor de desarrollo (rotar antes de producción).",
    );
  }
  if (problems.length > 0) {
    throw new Error(
      [
        "El build de producción se detuvo: faltan datos de configuración obligatorios.",
        ...problems.map((p) => `  - ${p}`),
      ].join("\n"),
    );
  }
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

// Baseline security headers (docs/auditoria-seguridad-y-cumplimiento-good-boy.md
// P1 "Cabeceras HTTP"). The CSP keeps 'unsafe-inline' for script/style because
// Next's inline bootstrap isn't nonce'd in this setup — a reasonable baseline,
// not a strict nonce-based CSP. 'unsafe-eval' is added only outside
// production: dev-mode React uses eval() to reconstruct stack traces for
// debugging and never uses it in production, so relaxing this in dev doesn't
// weaken the policy that actually ships.
const scriptSrc =
  process.env.NODE_ENV === "production"
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "frame-ancestors 'none'",
      `connect-src 'self' ${supabaseUrl}`,
      "img-src 'self' data:",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
