"use server";

import { redirect } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export async function signOutAdmin() {
  const supabase = await getServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/admin/login");
}
