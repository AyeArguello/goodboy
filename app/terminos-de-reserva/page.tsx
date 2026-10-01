import type { Metadata } from "next";
import { businessConfig } from "@/lib/config/business";

export const metadata: Metadata = {
  title: "Términos de reserva",
  // TODO(assumptions.md #2): quitar noindex cuando el texto legal deje de ser [PENDIENTE].
  robots: { index: false, follow: true },
};

export default function TerminosDeReservaPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-14">
      <h1 className="font-heading m-0 text-3xl font-bold">
        Términos de reserva
      </h1>
      <p className="text-purple">
        [PENDIENTE] Texto legal completo a definir por la dueña de{" "}
        {businessConfig.name} (razón social/responsable:{" "}
        {businessConfig.legalEntityName}).
      </p>
      <div className="text-ink-soft flex flex-col gap-2">
        <p>En resumen (sujeto al texto final):</p>
        <ul className="list-disc pl-5">
          <li>
            Los turnos se solicitan con al menos{" "}
            {businessConfig.rules.minLeadHours} h de anticipación.
          </li>
          <li>
            Toda solicitud queda pendiente de revisión hasta que la dueña la
            aprueba.
          </li>
          <li>
            Para confirmar un turno aprobado se requiere una seña de ARS{" "}
            {businessConfig.deposit.amountArs.toLocaleString("es-AR")}, que se
            descuenta del total del servicio.
          </li>
          <li>{businessConfig.cancellationPolicyText}</li>
          <li>
            Los precios publicados son orientativos; el precio final se confirma
            al recibir al perro.
          </li>
          <li>
            {businessConfig.deposit.paymentOptions.enabled
              ? "Pagos con tarjeta vía Mercado Pago tienen un recargo según la cantidad de cuotas, informado antes de pagar."
              : "Por ahora no se cobra ningún recargo por pagar con tarjeta — esa opción está en revisión y no está habilitada."}
          </li>
          <li>{businessConfig.businessCancellationPolicyText}</li>
        </ul>
      </div>
    </main>
  );
}
