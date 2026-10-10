import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env/public";

const PUBLIC_ADMIN_PATHS = [
  "/admin/login",
  "/admin/recuperar",
  "/admin/auth/reset",
  "/admin/auth/confirm",
];

/**
 * Route-level gate for /admin/*. It only checks "is there a session", never
 * business authorization. The actual authorization boundary is the database —
 * is_admin() inside every RPC, and RLS on every table — so a session without
 * an admin_profiles row (never created for a non-allowlisted email) can load
 * the shell but every data call fails.
 *
 * Kept as `middleware.ts` (edge runtime), NOT as Next 16's `proxy.ts`
 * (Node.js runtime): the Netlify Next.js adapter currently cannot package the
 * Node.js proxy — the deploy fails while bundling it ("Cannot find module
 * './chunks/[turbopack]_runtime.js'", opennextjs/opennextjs-netlify#3575).
 * `next build` prints a deprecation warning for this file name; it is
 * expected. Switch back to `proxy.ts` / `export async function proxy` once
 * Netlify fixes that (see docs/deploy-payment-receipts-production.md).
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p)))
    return NextResponse.next();

  let response = NextResponse.next({ request });
  const env = getPublicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet)
            response.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
