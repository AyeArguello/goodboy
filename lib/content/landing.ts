import { businessConfig } from "@/lib/config/business";
import {
  SERVICE_PACKAGE_INCLUDES,
  SERVICE_PACKAGE_LABELS,
  type ServicePackageKey,
} from "@/lib/domain/appointment";
import { formatDurationHM } from "@/lib/domain/datetime";

/**
 * All landing copy in one typed place (per "centralizá copy/datos en
 * configuración tipada"). Text here is either confirmed by the design
 * handoff verbatim, or pulled from businessConfig.
 */

export const nav = [
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Servicios", href: "#servicios" },
  { label: "Precios", href: "#precios" },
  { label: "Galería", href: "#galeria" },
  { label: "Traslado", href: "#traslado" },
  { label: "Preguntas", href: "#preguntas" },
  { label: "Contacto", href: "#contacto" },
] as const;

export const trustItems = [
  {
    icon: "M4 6.5h16v13H4zM4 10.5h16M8.5 4v4M15.5 4v4",
    title: "Con turno previo",
    text: `Mínimo ${businessConfig.rules.minLeadHours} h de anticipación`,
  },
  {
    icon: "M8 13.5a2 2 0 1 0 0-.01M12 9a1.8 1.8 0 1 0 0-.01M16 13.5a2 2 0 1 0 0-.01M12 14c-2.5 0-4 2.2-4 4 0 1.2 1 1.8 2 1.5 1.3-.4 2.7-.4 4 0 1 .3 2-.3 2-1.5 0-1.8-1.5-4-4-4z",
    title: `Hasta ${businessConfig.weeklySchedule.weekday.maxActivePerDay} perros de lunes a viernes`,
    text: `Sábados, ${businessConfig.weeklySchedule.saturday.maxActivePerDay} turno a las ${businessConfig.weeklySchedule.saturday.slotTimes[0]}`,
  },
  {
    icon: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 18.5a1.5 1.5 0 1 0 0-.01M17 18.5a1.5 1.5 0 1 0 0-.01",
    title: "Traslado ida y vuelta",
    text: "Costo según barrio",
  },
  {
    icon: "M3.5 12.5l8-8H20v8.5l-8 8zM15.5 8.5a.5.5 0 1 0 0-.01",
    title: "Precio final tras evaluación",
    text: "Según tamaño y pelo",
  },
] as const;

const SERVICE_PACKAGE_KEYS: ServicePackageKey[] = [
  "corto_doble_capa",
  "crecimiento_continuo",
];

export const servicePackages = SERVICE_PACKAGE_KEYS.map((key, i) => ({
  n: String(i + 1).padStart(2, "0"),
  key,
  title: SERVICE_PACKAGE_LABELS[key],
  includes: SERVICE_PACKAGE_INCLUDES[key],
}));

export const howItWorksSteps = [
  {
    n: "1",
    title: "Elegís un horario",
    text: `Mirás los horarios disponibles y elegís el que te sirva, con ${businessConfig.rules.minLeadHours} h de anticipación o más.`,
  },
  {
    n: "2",
    title: "Nos contás de tu perro",
    text: "Tamaño, raza o cruza, estado del pelo y qué servicio necesita. Si querés traslado, tu barrio.",
  },
  {
    n: "3",
    title: "Te aprobamos y pedimos la seña",
    text: `Si la peluquera aprueba tu solicitud, te mandamos por email los datos para transferir la seña de ARS ${businessConfig.deposit.amountArs.toLocaleString("es-AR")} (se descuenta del total) y un enlace seguro para subir el comprobante.`,
  },
  {
    n: "4",
    title: "Subís el comprobante y queda confirmado",
    text: "Transferís la seña y subís una foto del comprobante. Lo verificamos a mano: el turno se confirma recién cuando lo verificamos, y te avisamos por email.",
  },
  {
    n: "5",
    title: "El día del turno",
    text: "Lo traés o lo buscamos. Al recibirlo evaluamos y confirmamos el precio final.",
  },
] as const;

export const priceRows = [
  {
    key: "pequeno",
    ...businessConfig.prices.pequeno,
  },
  {
    key: "mediano",
    ...businessConfig.prices.mediano,
  },
  {
    key: "grande",
    ...businessConfig.prices.grande,
  },
] as const;

export function faqs(): { question: string; answer: string }[] {
  return [
    {
      question: "¿Puedo pedir turno para hoy?",
      answer: `No. Los turnos se piden con al menos ${businessConfig.rules.minLeadHours} horas de anticipación, para organizar el día y dedicarle a cada perro el tiempo que necesita.`,
    },
    {
      question: "¿Cuándo queda confirmado mi turno?",
      answer:
        "Primero la peluquera revisa y aprueba tu solicitud. Después te pedimos una seña de ARS " +
        `${businessConfig.deposit.amountArs.toLocaleString("es-AR")} (se descuenta del total) — el turno queda confirmado recién cuando la registramos.`,
    },
    {
      question: "¿Cuánto dura el turno?",
      answer: `Aproximadamente entre ${formatDurationHM(businessConfig.rules.serviceDurationMinMinutes)} y ${formatDurationHM(businessConfig.rules.serviceDurationMaxMinutes)}, según el tamaño, el pelo y el trabajo necesario.`,
    },
    {
      question: "¿Por qué el precio es orientativo?",
      answer:
        "Porque el precio final depende del tamaño real, el estado del pelo y el trabajo que necesite tu perro. Se confirma al recibirlo y evaluarlo.",
    },
    {
      question: "¿Cuánto cuesta el traslado?",
      answer: `${businessConfig.transportPricing.freeLabel}: ${businessConfig.transportPricing.freeText}. ${businessConfig.transportPricing.nearbyLabel}: ${businessConfig.transportPricing.nearbyRange}. ${businessConfig.transportPricing.farLabel}: ${businessConfig.transportPricing.farRange}. Es un único cargo con ida y vuelta, y se confirma según el barrio.`,
    },
    {
      question: "¿Tengo que pagar la seña al pedir el turno?",
      answer:
        "No. Se paga recién si la peluquera aprueba tu solicitud, y se descuenta del total del servicio.",
    },
    {
      question: "¿Cómo se paga la seña?",
      answer:
        "Por transferencia bancaria, sin recargo. Cuando aprobamos tu solicitud te mandamos por email los datos para transferir y un enlace para subir el comprobante. Lo verificamos a mano y te avisamos por email cuando el turno queda confirmado.",
    },
    {
      question: "¿Qué pasa si necesito cancelar?",
      answer: businessConfig.cancellationPolicyText,
    },
  ];
}
