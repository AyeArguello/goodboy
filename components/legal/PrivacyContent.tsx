import { businessConfig, depositRuleText } from "@/lib/config/business";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";

/** The body of the privacy policy, shared by the page and the in-flow dialog. */
export function PrivacyContent({
  sectionLevel = "h2",
}: {
  sectionLevel?: "h2" | "h3";
}) {
  const H = sectionLevel;
  return (
    <>
      <p className="text-purple">
        [PENDIENTE] Texto legal completo a definir por la peluquera de{" "}
        {businessConfig.name}.
      </p>
      <p className="text-ink-soft">
        En resumen (sujeto al texto final): los datos que dejás al pedir un
        turno (nombre, WhatsApp y datos de tu perro) se usan solo para gestionar
        esa solicitud. No se venden ni se comparten con fines publicitarios; los
        proveedores técnicos indicados más abajo los procesan únicamente para
        prestar el servicio.
      </p>

      <section aria-labelledby="contacto" className="flex flex-col gap-2">
        <H id="contacto" className="font-heading m-0 text-xl font-bold">
          Cómo nos comunicamos
        </H>
        <p className="text-ink-soft m-0">
          Te escribimos por WhatsApp para avisarte cuando aprobamos tu
          solicitud, pedirte la seña y confirmar, cancelar o reprogramar el
          turno. No te enviamos correos: el correo solo se usa internamente para
          avisar a la peluquera de cada solicitud nueva.
        </p>
      </section>

      <section aria-labelledby="cookies" className="flex flex-col gap-2">
        <H id="cookies" className="font-heading m-0 text-xl font-bold">
          Cookies y almacenamiento técnico
        </H>
        <p className="text-ink-soft m-0">
          El sitio no usa cookies publicitarias ni de analítica. El panel de
          administración utiliza únicamente cookies técnicas de sesión de
          Supabase, necesarias para autenticar a la persona administradora y
          proteger el acceso. Mientras esto no cambie, no se requiere un banner
          de consentimiento para cookies opcionales.
        </p>
      </section>

      <section aria-labelledby="comprobantes" className="flex flex-col gap-2">
        <H id="comprobantes" className="font-heading m-0 text-xl font-bold">
          Comprobantes de pago
        </H>
        <ul className="text-ink-soft m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong>Para qué:</strong> verificar a mano que recibimos la seña (
            {depositRuleText()}) por transferencia, y así confirmar tu turno.
          </li>
          <li>
            <strong>Qué guardamos:</strong> la imagen que subís (JPG, PNG o
            WebP, hasta 5 MB), la referencia de la operación si la escribís y la
            fecha de carga. No guardamos el nombre original del archivo.
          </li>
          <li>
            <strong>Quién accede:</strong> solo las personas administradoras de{" "}
            {businessConfig.legalDisclaimerName}, con sesión iniciada, mediante
            enlaces temporales que vencen en un minuto. El archivo está en un
            almacenamiento privado: no tiene enlaces públicos ni se puede
            listar.
          </li>
          <li>
            <strong>Verificación manual:</strong> una persona revisa cada
            comprobante. No hay verificación automática ni conexión con bancos o
            medios de pago.
          </li>
          <li>
            <strong>Cuánto tiempo:</strong> si lo rechazamos, lo eliminamos a
            los 7 días; si la solicitud vence sin pago, a los 7 días; si el
            turno se completa, se cancela o se cierra, a los 30 días del cierre.
            La eliminación es automática.
          </li>
          <li>
            <strong>Excepción por reclamos o devoluciones:</strong> si hay un
            reclamo o una devolución pendiente, suspendemos la eliminación.
            Cuando se resuelve, conservamos el comprobante hasta 180 días más.
          </li>
          <li>
            <strong>Qué queda después de eliminar el archivo:</strong> el
            importe, el medio, la referencia mínima de la operación, la fecha,
            quién verificó y cuándo, el estado del pago y si hubo devolución o
            pérdida de la seña. La imagen ya no se conserva.
          </li>
        </ul>
      </section>

      <section aria-labelledby="proveedores" className="flex flex-col gap-2">
        <H id="proveedores" className="font-heading m-0 text-xl font-bold">
          Quiénes procesan datos por nosotros
        </H>
        <p className="text-ink-soft m-0">
          Usamos Supabase para la base de datos y el almacenamiento privado de
          los comprobantes, y Resend para enviar a la peluquera los avisos
          internos por correo. Estos proveedores pueden procesar datos en
          servidores fuera de Argentina.
        </p>
      </section>

      <section aria-labelledby="derechos" className="flex flex-col gap-2">
        <H id="derechos" className="font-heading m-0 text-xl font-bold">
          Acceso, corrección y supresión
        </H>
        <p className="text-ink-soft m-0">
          Podés pedirnos acceso, corrección o supresión de tus datos, incluido
          el comprobante, escribiéndonos por{" "}
          <a
            href={businessWhatsAppLink(
              "Hola, quiero ejercer mis derechos sobre mis datos personales.",
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>{" "}
          o respondiendo cualquiera de nuestros mensajes. Si hay un reclamo o
          una devolución en curso, podemos conservar lo necesario hasta
          resolverlo.
        </p>
      </section>
    </>
  );
}
