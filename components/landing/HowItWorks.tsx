import { howItWorksSteps } from "@/lib/content/landing";

export function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-5 py-14 sm:px-8 md:py-24">
        <div className="flex max-w-xl flex-col gap-3">
          <p className="font-heading text-purple m-0 text-sm font-semibold tracking-[0.14em] uppercase">
            Cómo funciona
          </p>
          <h2 className="font-heading text-charcoal m-0 text-[clamp(28px,3.4vw,44px)] leading-tight font-bold tracking-tight">
            Cinco pasos, con tiempo
          </h2>
        </div>
        <ol className="m-0 grid list-none grid-cols-1 gap-8 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {howItWorksSteps.map((s) => (
            <li key={s.n} className="flex flex-col gap-3">
              <span className="bg-lavender font-heading text-charcoal flex size-14 items-center justify-center rounded-full text-xl font-bold">
                {s.n}
              </span>
              <strong className="font-heading text-[19px] leading-snug font-bold">
                {s.title}
              </strong>
              <span className="text-ink-soft text-pretty">{s.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
