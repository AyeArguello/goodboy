import type { Metadata } from "next";
import { ConfirmRecoveryForm } from "@/components/admin/ConfirmRecoveryForm";

export const metadata: Metadata = {
  title: "Confirmar recuperación",
  robots: { index: false, follow: false },
  // The link carries a one-time token: never forward it in a Referer header.
  referrer: "no-referrer",
};

export default async function AdminRecoveryConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  return <ConfirmRecoveryForm tokenHash={tokenHash ?? ""} type={type ?? ""} />;
}
