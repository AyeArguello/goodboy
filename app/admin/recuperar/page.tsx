import type { Metadata } from "next";
import { RecoveryForm } from "@/components/admin/RecoveryForm";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false, follow: false },
};

export default function AdminRecoveryPage() {
  return <RecoveryForm />;
}
