import type { NextConfig } from "next";
import { assertProductionBusinessConfig } from "./lib/config/business";
import { assertProductionEnv } from "./lib/config/productionGate";

// Fails the build/boot loudly if NAP, WhatsApp, business hours, cancellation
// policy or the production domain are still placeholders (see
// docs/assumptions.md and lib/config/business.ts), or if Supabase
// URL/anon/service-role keys, the HTTPS domain, the admin allowlist or the
// rate-limit HMAC secret are missing or still dev defaults. The secrets gate
// lives in lib/config/productionGate.ts and takes a plain env object because
// lib/env/server.ts carries the `server-only` guard, which Next's config
// loader also enforces for next.config.ts.
if (process.env.NODE_ENV === "production") {
  assertProductionBusinessConfig();
  assertProductionEnv(process.env);
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
      // The Supabase origin is allowed so the admin can preview a receipt
      // through its short-lived signed Storage URL.
      `img-src 'self' data: ${supabaseUrl}`,
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
