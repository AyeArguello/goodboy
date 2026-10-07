import type { Metadata } from "next";
import { businessConfig } from "@/lib/config/business";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";

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
        turno (nombre, WhatsApp, correo y datos de tu perro) se usan solo para
        gestionar esa solicitud. No se venden ni se comparten con fines
        publicitarios; los proveedores técnicos indicados más abajo los procesan
        únicamente para prestar el servicio.
      </p>

      <section aria-labelledby="correo" className="flex flex-col gap-2">
        <h2 id="correo" className="font-heading m-0 text-xl font-bold">
          Tu correo
        </h2>
        <p className="text-ink-soft m-0">
          El correo es obligatorio porque es nuestro canal automático de aviso:
          te escribimos cuando recibimos tu solicitud, cuando la aprobamos (con
          los datos para la seña), cuando recibimos o rechazamos tu comprobante,
          y cuando el turno se confirma, se cancela o se reprograma, o si
          registramos una devolución. Para enviarlos usamos un proveedor de
          envío de emails.
        </p>
      </section>

      <section aria-labelledby="cookies" className="flex flex-col gap-2">
        <h2 id="cookies" className="font-heading m-0 text-xl font-bold">
          Cookies y almacenamiento técnico
        </h2>
        <p className="text-ink-soft m-0">
          El sitio no usa cookies publicitarias ni de analítica. El panel de
          administración utiliza únicamente cookies técnicas de sesión de
          Supabase, necesarias para autenticar a la persona administradora y
          proteger el acceso. Mientras esto no cambie, no se requiere un banner
          de consentimiento para cookies opcionales.
        </p>
      </section>

      <section aria-labelledby="comprobantes" className="flex flex-col gap-2">
        <h2 id="comprobantes" className="font-heading m-0 text-xl font-bold">
          Comprobantes de pago
        </h2>
        <ul className="text-ink-soft m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong>Para qué:</strong> verificar a mano que recibimos la seña de
            ARS {businessConfig.deposit.amountArs.toLocaleString("es-AR")} por
            transferencia, y así confirmar tu turno.
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
        <h2 id="proveedores" className="font-heading m-0 text-xl font-bold">
          Quiénes procesan datos por nosotros
        </h2>
        <p className="text-ink-soft m-0">
          Usamos Supabase para la base de datos y el almacenamiento privado de
          los comprobantes, y Resend para enviar los emails. Estos proveedores
          pueden procesar datos en servidores fuera de Argentina.
        </p>
      </section>

      <section aria-labelledby="derechos" className="flex flex-col gap-2">
        <h2 id="derechos" className="font-heading m-0 text-xl font-bold">
          Acceso, corrección y supresión
        </h2>
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
          o respondiendo cualquiera de nuestros emails. Si hay un reclamo o una
          devolución en curso, podemos conservar lo necesario hasta resolverlo.
        </p>
      </section>
    </main>
  );
}
