import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/admin/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Crear contraseña",
  robots: { index: false, follow: false },
};

export default function AdminResetPasswordPage() {
  return <ResetPasswordForm />;
}
