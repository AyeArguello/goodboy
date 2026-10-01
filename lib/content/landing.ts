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
 * handoff verbatim, or pulled from businessConfig so pending fields show a
 * single, consistent [PENDIENTE] marker everywhere they appear.
 */

export const nav = [
  { label: "Servicios", href: "#servicios" },
  { label: "Cómo funciona", href: "#como-funciona" },
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
    text: "Según tamaño y manto",
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
    text: `Mirás los horarios publicados y elegís el que te sirva, con ${businessConfig.rules.minLeadHours} h de anticipación o más.`,
  },
  {
    n: "2",
    title: "Nos contás de tu perro",
    text: "Tamaño, raza o cruza, estado del manto y qué servicio necesita. Si querés traslado, tu barrio.",
  },
  {
    n: "3",
    title: "Te aprobamos y pedimos la seña",
    text: `Si la dueña aprueba tu solicitud, te pasamos los datos para pagar la seña de ARS ${businessConfig.deposit.amountArs.toLocaleString("es-AR")} (se descuenta del total).`,
  },
  {
    n: "4",
    title: "Pagás la seña y queda confirmado",
    text: "Por transferencia o Mercado Pago. El turno se confirma recién cuando registramos el pago.",
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
    ref: businessConfig.sizeKgReference.pequeno,
  },
  {
    key: "mediano",
    ...businessConfig.prices.mediano,
    ref: businessConfig.sizeKgReference.mediano,
  },
  {
    key: "grande",
    ...businessConfig.prices.grande,
    ref: businessConfig.sizeKgReference.grande,
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
        "Primero la dueña revisa y aprueba tu solicitud. Después te pedimos una seña de ARS " +
        `${businessConfig.deposit.amountArs.toLocaleString("es-AR")} (se descuenta del total) — el turno queda confirmado recién cuando la registramos.`,
    },
    {
      question: "¿Cuánto dura el turno?",
      answer: `Aproximadamente entre ${formatDurationHM(businessConfig.rules.serviceDurationMinMinutes)} y ${formatDurationHM(businessConfig.rules.serviceDurationMaxMinutes)}, según el tamaño, el manto y el trabajo necesario.`,
    },
    {
      question: "¿Por qué el precio es orientativo?",
      answer:
        "Porque el precio final depende del tamaño real, el estado del manto y el trabajo que necesite tu perro. Se confirma al recibirlo y evaluarlo.",
    },
    {
      question: "¿Cuánto cuesta el traslado?",
      answer: `${businessConfig.transportPricing.freeLabel}: ${businessConfig.transportPricing.freeText}. ${businessConfig.transportPricing.nearbyLabel}: ${businessConfig.transportPricing.nearbyRange}. ${businessConfig.transportPricing.farLabel}: ${businessConfig.transportPricing.farRange}. Es un único cargo con ida y vuelta, y se confirma según el barrio.`,
    },
    {
      question: "¿Tengo que pagar la seña al pedir el turno?",
      answer:
        "No. Se paga recién si la dueña aprueba tu solicitud, y se descuenta del total del servicio.",
    },
    {
      question: "¿Hay recargo si pago la seña con tarjeta?",
      answer: businessConfig.deposit.paymentOptions.enabled
        ? "Sí, pagando con tarjeta vía Mercado Pago hay un recargo según la cantidad de cuotas, informado antes de pagar. Efectivo y transferencia no tienen recargo."
        : "Por ahora no se cobra ningún recargo por pagar con tarjeta — estamos revisando esa opción con un profesional antes de habilitarla. Efectivo y transferencia tampoco tienen recargo.",
    },
    {
      question: "¿Qué pasa si necesito cancelar?",
      answer: businessConfig.cancellationPolicyText,
    },
  ];
}

export interface GalleryItem {
  id: string;
  /** Path under public/, once a real photo is assigned. Absent = placeholder slot. */
  src?: string;
  caption: string;
}

/**
 * Static gallery manifest (per "la galería es estática en el repositorio").
 * Photos live in public/images/perros/ — drop new files there and point a
 * `src` at one to update the gallery, no CMS/uploader involved. Thumbnails
 * render at a fixed aspect ratio (see Gallery.tsx), so entries don't need a
 * layout hint here.
 */
export const galleryItems: GalleryItem[] = [
  {
    id: "g1",
    src: "/images/perros/perrito2.webp",
    caption: "Golden recién bañado y secado",
  },
  {
    id: "g2",
    src: "/images/perros/perrito3.webp",
    caption: "Bulldog francés, terminación prolija",
  },
  {
    id: "g3",
    src: "/images/perros/perrito5.webp",
    caption: "Yorkshire con corte de cara",
  },
  {
    id: "g4",
    src: "/images/perros/perrito7.webp",
    caption: "Turno de baño y cepillado",
  },
  {
    id: "g5",
    src: "/images/perros/perrito9.webp",
    caption: "Después del deslanado",
  },
  {
    id: "g6",
    src: "/images/perros/perrito12.webp",
    caption: "Corte de uñas y limpieza de oídos",
  },
  {
    id: "g7",
    src: "/images/perros/perrito4.webp",
    caption: "Terminación de manto corto",
  },
  {
    id: "g8",
    src: "/images/perros/perrito6.webp",
    caption: "Corte parejo y prolijo",
  },
  {
    id: "g9",
    src: "/images/perros/perrito8.webp",
    caption: "Listo después del turno",
  },
  {
    id: "g10",
    src: "/images/perros/perrito10.webp",
    caption: "Manto prolijo de cuerpo entero",
  },
  {
    id: "g11",
    src: "/images/perros/perrito11.webp",
    caption: "Caniche con corte de cara",
  },
  {
    id: "g12",
    src: "/images/perros/perrito13.webp",
    caption: "Baño y secado completo",
  },
  {
    id: "g13",
    src: "/images/perros/perrito14.webp",
    caption: "Descansando después del baño",
  },
  {
    id: "g14",
    src: "/images/perros/perrito15.webp",
    caption: "Corte de cara y orejas",
  },
  {
    id: "g15",
    src: "/images/perros/perrito16.webp",
    caption: "Contento después de su turno",
  },
];
