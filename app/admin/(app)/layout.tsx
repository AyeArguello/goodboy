import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  expireOverdueDeposits,
  getAdminSession,
  getPendingCount,
} from "@/lib/data/admin";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login?error=not_allowed");

  // Cheap, idempotent sweep so every admin view reflects lapsed deposit
  // windows as `expired` rather than relying only on the public RPCs' lazy
  // expiration check — see docs/assumptions.md §3.
  await expireOverdueDeposits();

  const pendingCount = await getPendingCount();

  return <AdminShell pendingCount={pendingCount}>{children}</AdminShell>;
}
