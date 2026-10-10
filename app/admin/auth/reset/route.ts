import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/admin/login?error=recovery", url.origin),
    );
  }

  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const email = data.user?.email?.toLowerCase();
  const { ADMIN_EMAIL_ALLOWLIST } = getServerEnv();

  if (error || !data.user || !email || !ADMIN_EMAIL_ALLOWLIST.includes(email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/admin/login?error=recovery", url.origin),
    );
  }

  const service = getServiceSupabaseClient();
  const { error: profileError } = await service
    .from("admin_profiles")
    .upsert({ id: data.user.id, email });
  if (profileError) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/admin/login?error=recovery", url.origin),
    );
  }

  const response = NextResponse.redirect(
    new URL("/admin/restablecer", url.origin),
  );
  response.cookies.set("admin-password-recovery", "allowed", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 10 * 60,
  });
  return response;
}
