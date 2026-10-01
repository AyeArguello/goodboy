import { servicePackages } from "@/lib/content/landing";

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#684E7A"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Services() {
  return (
    <section
      id="servicios"
      className="mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-24"
    >
      <div className="flex flex-col gap-10">
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="font-heading text-purple m-0 text-sm font-semibold tracking-[0.14em] uppercase">
            Servicios
          </p>
          <h2 className="font-heading text-charcoal m-0 text-[clamp(28px,3.4vw,44px)] leading-tight font-bold tracking-tight text-balance">
            Lo que hacemos, sin apuro
          </h2>
          <p className="text-ink-soft m-0 max-w-[28em]">
            Cada turno dura entre 2 h 30 min y 3 h 30 min. Elegís el servicio
            según el tipo de manto de tu perro; el trabajo puntual se define al
            recibirlo.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          {servicePackages.map((pkg) => (
            <div
              key={pkg.key}
              className="border-charcoal flex flex-col gap-4 rounded-xl border-[1.5px] bg-white p-6"
            >
              <span className="font-heading text-purple text-sm font-semibold">
                {pkg.n}
              </span>
              <strong className="font-heading text-2xl leading-tight font-bold text-balance">
                {pkg.title}
              </strong>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {pkg.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[17px]">
                    <CheckIcon />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
