import { getPublicEnv } from "../env/public";

/**
 * Single source of truth for business data (NAP, WhatsApp, pricing, rules,
 * pending copy). Confirmed data is a literal constant. Anything not yet
 * confirmed by the owner comes from an env var with a `[PENDIENTE]`-tagged
 * dev fallback — see docs/assumptions.md section 2 for the full list and
 * why each one blocks launch.
 *
 * `assertProductionBusinessConfig` is called from `next.config.ts` during
 * `next build` in production so the build fails loudly instead of shipping
 * placeholder NAP/WhatsApp/domain/deposit data.
 */

const PENDING = "[PENDIENTE]" as const;

function envOr(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback;
}

export const businessConfig = {
  name: "Good Boy — Peluquería Canina",
  legalDisclaimerName: "Good Boy",
  // Ayelén Argüello is the confirmed responsible person; fiscal/CUIT review
  // remains pending before the final legal pages are published.
  legalEntityName: envOr(
    process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME,
    `${PENDING} razón social`,
  ),
  address: {
    street: "Manuel Toro 4047",
    city: "Córdoba Capital",
    province: "Córdoba",
    countryCode: "AR",
    postalCode: "5010",
  },
  timezone: "America/Argentina/Cordoba",
  whatsappNumberE164: "+5493512722097",
  instagramUrl: "https://www.instagram.com/goodboy.peluca/",
  businessHoursText:
    "Lunes a viernes, turnos a las 9:00, 11:30 y 13:30 (cierre 16:00) · Sábados, único turno a las 11:00",
  cancellationPolicyText:
    "Si cancelás con 48 h o más de anticipación, podés reprogramar para otra fecha dentro del mismo mes y conservar la seña. Si no reprogramás dentro de ese período, o cancelás con menos de 48 h, la seña no se reintegra.",
  businessCancellationPolicyText: envOr(
    process.env.NEXT_PUBLIC_BUSINESS_CANCELLATION_POLICY_TEXT,
    "Si Good Boy cancela o no puede prestar el servicio por fuerza mayor, podés elegir entre reprogramar sin costo o recibir la devolución total de la seña dentro de las 24 h mediante transferencia.",
  ),
  absencePolicyText:
    "Ante inasistencia, demora que impida prestar el servicio o imposibilidad de atender al perro, no se cobra el saldo del servicio y la seña no se reintegra.",
  sizeKgReference: {
    pequeno: envOr(
      process.env.NEXT_PUBLIC_SIZE_REF_PEQUENO_KG,
      `${PENDING} kg`,
    ),
    mediano: envOr(
      process.env.NEXT_PUBLIC_SIZE_REF_MEDIANO_KG,
      `${PENDING} kg`,
    ),
    grande: envOr(process.env.NEXT_PUBLIC_SIZE_REF_GRANDE_KG, `${PENDING} kg`),
  },
  responseTimeText: envOr(
    process.env.NEXT_PUBLIC_RESPONSE_TIME_TEXT,
    `${PENDING} plazo de respuesta`,
  ),
  prices: {
    pequeno: { label: "Pequeño", range: "30.000–40.000" },
    mediano: { label: "Mediano", range: "40.000–50.000" },
    grande: { label: "Grande", range: "60.000–70.000" },
  },
  /** Confirmed three-tier transport pricing. Never publish a list of excluded/"unsafe" neighborhoods. */
  transportPricing: {
    freeLabel: "Barrio Las Palmas",
    freeText: "Sin cargo",
    nearbyLabel: "Barrios cercanos a Las Palmas y barrio Jardín",
    nearbyRange: "ARS 5.000–8.000",
    farLabel: "Zonas más alejadas",
    farRange: "ARS 10.000–13.000",
    disclaimer:
      "Servicio sujeto a cobertura y condiciones de seguridad. Confirmamos tu dirección por WhatsApp antes del turno.",
  },
  deposit: {
    amountArs: 20000,
    /** Confirmed by the owner on 2026-10-04. */
    dueHours: 24,
    dueHoursConfirmed: true,
    /**
     * Card-surcharge-by-installments model (docs/plan-web-good-boy.md §2). The
     * real business numbers are known (1 cuota = 7%, 3 cuotas = 10.5%), but
     * `enabled` stays `false` until legal/accounting review clears them — the
     * 7%-on-one-installment figure conflicts with Ley 25.065 art. 37(c)
     * (no cash/card price difference) per
     * docs/auditoria-seguridad-y-cumplimiento-good-boy.md. While disabled, no
     * UI may show a surcharge percentage or compute a card total.
     */
    paymentOptions: {
      enabled: false,
      options: [
        { installments: 1, surchargePercent: 7 },
        { installments: 3, surchargePercent: 10.5 },
      ] as { installments: 1 | 3; surchargePercent: number }[],
    },
  },
  /**
   * Saturday is a separate, smaller grid (single 11:00 slot, max 1 active
   * appointment) — not the Monday-Friday grid with a lower cap. Sunday is
   * closed entirely (no slots). See docs/plan-web-good-boy.md §2.
   */
  weeklySchedule: {
    weekday: {
      slotTimes: ["09:00", "11:30", "13:30"] as const,
      maxActivePerDay: 3,
    },
    saturday: {
      slotTimes: ["11:00"] as const,
      maxActivePerDay: 1,
    },
  },
  rules: {
    minLeadHours: 24,
    cancellationCutoffHours: 48,
    warnGapMinutes: 150,
    serviceDurationMinMinutes: 150,
    serviceDurationMaxMinutes: 210,
    closingTime: "16:00",
    codeAlphabet: "23456789ABCDEFGHJKLMNPQRSTUVWXYZ", // sin 0/O/1/I
    codePrefix: "GB-",
    /** Raised from 4→8 chars (auditoría: 4 chars ≈ 20 bits was too guessable). */
    codeLength: 8,
  },
  socialProofSameAs: ["https://www.instagram.com/goodboy.peluca/"] as string[],
} as const;

export function siteUrl(): string {
  return getPublicEnv().NEXT_PUBLIC_SITE_URL;
}

function isPending(value: string): boolean {
  return value.includes(PENDING);
}

/**
 * Throws with an aggregated, human-readable list of every unconfirmed
 * business-critical field. Call only when NODE_ENV === 'production' (see
 * next.config.ts) — dev may ship placeholders, but every `next build` is a production build
 * (including Netlify Deploy Previews), so those need the variables too.
 */
export function assertProductionBusinessConfig(): void {
  const problems: string[] = [];

  const publicEnv = getPublicEnv();
  if (publicEnv.NEXT_PUBLIC_SITE_URL.includes("localhost")) {
    problems.push(
      "NEXT_PUBLIC_SITE_URL sigue apuntando a localhost (confirmar dominio goodboy.com.ar o alternativo).",
    );
  }
  if (!/^\+\d{10,15}$/.test(businessConfig.whatsappNumberE164)) {
    problems.push("El número de WhatsApp no tiene formato E.164 válido.");
  }
  if (isPending(businessConfig.legalEntityName)) {
    problems.push(
      "NEXT_PUBLIC_LEGAL_ENTITY_NAME no está definida (razón social / responsable).",
    );
  }
  if (isPending(businessConfig.businessCancellationPolicyText)) {
    problems.push(
      "NEXT_PUBLIC_BUSINESS_CANCELLATION_POLICY_TEXT no está definida (política si Good Boy cancela / fuerza mayor).",
    );
  }
  if (
    businessConfig.deposit.paymentOptions.enabled &&
    businessConfig.deposit.paymentOptions.options.some(
      (o) => !(o.surchargePercent > 0),
    )
  ) {
    problems.push(
      "deposit.paymentOptions está habilitado pero tiene un surchargePercent inválido.",
    );
  }

  if (problems.length > 0) {
    throw new Error(
      [
        "El build de producción se detuvo: faltan datos de negocio obligatorios.",
        "Ver docs/assumptions.md (sección 2) para la lista completa y dónde se usan.",
        ...problems.map((p) => `  - ${p}`),
      ].join("\n"),
    );
  }
}
