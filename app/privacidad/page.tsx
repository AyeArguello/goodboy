import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/PrivacyContent";

export const metadata: Metadata = {
  title: "Política de privacidad",
  // TODO(assumptions.md #2): quitar noindex cuando el texto legal deje de ser [PENDIENTE].
  robots: { index: false, follow: true },
};

export default function PrivacidadPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-14">
      <h1 className="font-heading m-0 text-3xl font-bold">
        Política de privacidad
      </h1>
      <PrivacyContent />
    </main>
  );
}
