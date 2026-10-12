import type { ReactNode } from "react";
import { businessConfig, depositRuleText } from "@/lib/config/business";

/** The body of the booking terms, shared by the page and the in-flow dialog. */
export function TermsContent({
  sectionLevel = "h2",
  privacyLink = <a href="/privacidad">política de privacidad</a>,
}: {
  sectionLevel?: "h2" | "h3";
  /** Lets the dialog open the privacy policy in place instead of navigating. */
  privacyLink?: ReactNode;
}) {
  const H = sectionLevel;
  return (
    <>
      <p className="text-purple">
        [BORRADOR PENDIENTE DE REVISIÓN LEGAL] Responsable: Ayelén Argüello.
        Good Boy es el nombre comercial del servicio.
      </p>
      <div className="text-ink-soft flex flex-col gap-2">
        <p>En resumen (sujeto al texto final):</p>
        <ul className="list-disc pl-5">
          <li>
            Los turnos se solicitan con al menos{" "}
            {businessConfig.rules.minLeadHours} h de anticipación.
          </li>
          <li>
            Toda solicitud queda pendiente de revisión hasta que la peluquera la
            aprueba. Te avisamos por WhatsApp.
          </li>
          <li>
            Para confirmar un turno aprobado se requiere una seña de{" "}
            {depositRuleText()}, que se descuenta del total del servicio.
          </li>
          <li>
            La seña se paga únicamente por transferencia bancaria. Cuando
            aprobamos tu solicitud te mandamos por WhatsApp los datos para
            transferir; después nos enviás una foto o captura del comprobante
            por ese mismo chat. El plazo general es de{" "}
            {businessConfig.deposit.dueHours} h desde la aprobación; si el turno
            está próximo, se aplica el vencimiento anterior indicado por el
            sistema.
          </li>
          <li>
            Verificamos cada comprobante a mano. El turno queda confirmado
            recién cuando lo verificamos y te avisamos por WhatsApp; enviar el
            comprobante no lo confirma por sí solo.
          </li>
          <li>
            Si no podemos verificar el comprobante, te explicamos el motivo por
            WhatsApp y podés mandar uno nuevo dentro del plazo.
          </li>
          <li>
            Si el plazo vence sin un comprobante válido, la solicitud vence y el
            horario vuelve a estar disponible.
          </li>
          <li>{businessConfig.cancellationPolicyText}</li>
          <li>{businessConfig.absencePolicyText}</li>
          <li>
            Los precios publicados son orientativos; el precio final se confirma
            al recibir al perro.
          </li>
          <li>
            No se cobra ningún recargo por pagar la seña. No ofrecemos pagos con
            tarjeta ni por plataformas de pago dentro de la web.
          </li>
          <li>{businessConfig.businessCancellationPolicyText}</li>
        </ul>
      </div>

      <section
        aria-labelledby="comprobante-datos"
        className="flex flex-col gap-2"
      >
        <H
          id="comprobante-datos"
          className="font-heading m-0 text-xl font-bold"
        >
          Sobre el comprobante que subís
        </H>
        <p className="text-ink-soft m-0">
          Se usa solo para verificar la seña, lo ven únicamente las personas
          administradoras y se guarda en un almacenamiento privado. Se elimina
          automáticamente: 7 días después de rechazado o de que la solicitud
          venza, y 30 días después del cierre del turno. Si hay un reclamo o una
          devolución pendiente, la eliminación se suspende y, al resolverse, se
          conserva hasta 180 días más. Podés pedir acceso o supresión según se
          explica en la {privacyLink}.
        </p>
      </section>
    </>
  );
}
