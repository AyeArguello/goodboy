import { businessConfig } from "@/lib/config/business";

export function Transport() {
  const t = businessConfig.transportPricing;
  const tiers = [
    { label: t.freeLabel, value: t.freeText },
    { label: t.nearbyLabel, value: t.nearbyRange },
    { label: t.farLabel, value: t.farRange },
  ];

  return (
    <section
      id="traslado"
      className="mx-auto grid max-w-7xl items-start gap-10 px-5 py-14 sm:px-8 md:grid-cols-2 md:gap-16 md:py-24"
    >
      <div className="flex flex-col gap-4">
        <p className="font-heading text-purple m-0 text-sm font-semibold tracking-[0.14em] uppercase">
          Traslado
        </p>
        <h2 className="font-heading text-charcoal m-0 text-[clamp(28px,3.4vw,44px)] leading-tight font-bold tracking-tight text-balance">
          Lo buscamos y lo devolvemos
        </h2>
        <p className="text-ink-soft m-0 max-w-[30em]">
          Es un único cargo que incluye ida y vuelta. El valor exacto se
          confirma según tu barrio antes del turno.
        </p>
      </div>
      <div className="bg-lavender-100 flex flex-col gap-1 rounded-xl p-6">
        {tiers.map((tier) => (
          <div
            key={tier.label}
            className="border-charcoal flex flex-wrap items-baseline justify-between gap-4 border-b-[1.5px] py-4 last:border-b-0"
          >
            <span className="text-[17px] font-bold">{tier.label}</span>
            <span className="font-heading text-xl font-bold tabular-nums">
              {tier.value}
            </span>
          </div>
        ))}
        <p className="text-charcoal m-0 pt-3 text-[15px]">
          Ida y vuelta incluidas · {t.disclaimer}
        </p>
      </div>
    </section>
  );
}
