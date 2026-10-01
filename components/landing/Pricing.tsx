import { priceRows } from "@/lib/content/landing";

function InfoIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#684E7A"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6M12 7.5v.5" />
    </svg>
  );
}

export function Pricing() {
  return (
    <section
      id="precios"
      className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-14 sm:px-8 md:py-24"
    >
      <div className="flex max-w-xl flex-col gap-3">
        <p className="font-heading text-purple m-0 text-sm font-semibold tracking-[0.14em] uppercase">
          Precios orientativos
        </p>
        <h2 className="font-heading text-charcoal m-0 text-[clamp(28px,3.4vw,44px)] leading-tight font-bold tracking-tight">
          Según el tamaño de tu perro
        </h2>
      </div>
      <div className="border-charcoal grid grid-cols-1 border-t-[1.5px] sm:grid-cols-3">
        {priceRows.map((p) => (
          <div
            key={p.key}
            className="border-lavender-100 flex flex-col gap-1.5 border-b py-7 pr-6"
          >
            <span className="font-heading text-purple text-sm font-semibold tracking-[0.06em] uppercase">
              {p.label}
            </span>
            <span className="font-heading text-[clamp(28px,3vw,36px)] leading-tight font-bold tabular-nums">
              {p.range}
            </span>
            <span className="text-ink-soft text-[15px]">ARS · {p.ref}</span>
          </div>
        ))}
      </div>
      <div
        role="note"
        className="border-charcoal grid grid-cols-[auto_1fr] items-start gap-4 rounded-xl border-[1.5px] bg-white p-6"
      >
        <InfoIcon />
        <div className="flex flex-col gap-1.5">
          <strong className="font-heading text-lg font-bold">
            El precio final se confirma al recibir a tu perro
          </strong>
          <p className="text-charcoal m-0 text-[17px] text-pretty">
            Lo definimos al evaluarlo según su tamaño real, el estado del manto
            y el trabajo necesario. El traslado se cobra aparte.
          </p>
        </div>
      </div>
    </section>
  );
}
