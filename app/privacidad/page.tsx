import type { Metadata } from "next";
import { businessConfig } from "@/lib/config/business";

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
      <p className="text-purple">
        [PENDIENTE] Texto legal completo a definir por la dueña de{" "}
        {businessConfig.name}.
      </p>
      <p className="text-ink-soft">
        En resumen (sujeto al texto final): los datos que dejás al pedir un
        turno (nombre, WhatsApp, correo opcional y datos de tu perro) se usan
        solo para gestionar esa solicitud. No se comparten con terceros ni se
        usan con fines de marketing.
      </p>
    </main>
  );
}
