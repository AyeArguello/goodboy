import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env/public";

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/auth/callback"];

/**
 * Next.js 16 renamed `middleware.ts`/`middleware()` to `proxy.ts`/`proxy()`
 * (nodejs runtime only, no edge) — see
 * node_modules/next/dist/docs/.../version-16.md. This is the route-level
 * gate for /admin/*: it only checks "is there a session", never business
 * authorization. The actual authorization boundary is the database —
 * is_admin() inside every RPC, and RLS on every table — so a session
 * without an admin_profiles row (never created for a non-allowlisted email;
 * see app/admin/auth/callback) can load the shell but every data call fails.
 */
export async function proxy(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
