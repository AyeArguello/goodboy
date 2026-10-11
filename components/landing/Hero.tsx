import type { CSSProperties } from "react";
import { businessConfig } from "@/lib/config/business";
import { HeroArt } from "./HeroArt";

function MapPinIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/** Words that rise into place one after another (pure CSS, painted without JS). */
function Words({ text, start }: { text: string; start: number }) {
  return text.split(" ").map((word, index, all) => (
    <span key={`${word}-${index}`}>
      <span
        className="hero-word"
        style={{ "--hero-delay": `${start + index * 90}ms` } as CSSProperties}
      >
        {word}
      </span>
      {index < all.length - 1 ? " " : null}
    </span>
  ));
}

export function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden bg-white">
      {/* Flat lavender shapes that give the first screen its color. */}
      <div
        aria-hidden="true"
        className="bg-lavender-100 absolute -top-32 -right-32 size-[420px] rounded-full md:size-[640px]"
      />

      <div className="relative mx-auto grid max-w-[1280px] items-center gap-14 px-5 pt-10 pb-16 sm:px-8 md:grid-cols-[1.18fr_0.82fr] md:gap-14 md:pt-16 md:pb-24">
        <div className="flex flex-col gap-6">
          <h1 className="font-heading text-charcoal m-0 leading-[1.02] font-bold tracking-[-0.035em]">
            <span className="block text-[clamp(46px,8.6vw,92px)] text-balance">
              <Words text="Peluquería canina" start={0} />
            </span>
            <span className="text-ink-soft mt-3 block text-[clamp(20px,2.5vw,30px)] leading-snug font-semibold tracking-tight">
              <Words text="con atención personalizada en" start={260} />
            </span>
            <span
              className="hero-in text-purple bg-lavender-100 relative mt-2 inline-block rounded-2xl px-3 pt-1 pb-2 text-[clamp(32px,5.6vw,62px)] leading-[1.08]"
              style={{ "--hero-delay": "520ms" } as CSSProperties}
            >
              {businessConfig.address.city}
              <svg
                aria-hidden="true"
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
                className="hero-squiggle text-purple absolute right-3 -bottom-2 left-3 h-2.5 w-[calc(100%-1.5rem)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <path
                  pathLength={1}
                  d="M2 7c12-9 24 9 36 0s24 9 36 0 24 9 36 0 24 9 36 0 24 9 36 0 12-3 14-2"
                />
              </svg>
            </span>
          </h1>

          <p
            className="hero-in text-ink-soft m-0 max-w-[34em] text-[clamp(17px,1.6vw,20px)] text-pretty"
            style={{ "--hero-delay": "640ms" } as CSSProperties}
          >
            Baño, secado y corte con turnos planificados para dedicarle a cada
            perro el tiempo que necesita.
          </p>

          <p
            className="hero-in text-ink-soft m-0 flex items-center gap-2 text-[15px]"
            style={{ "--hero-delay": "760ms" } as CSSProperties}
          >
            <span className="text-purple">
              <MapPinIcon />
            </span>
            <span>
              {businessConfig.address.street} · Lunes a sábado, con turno
            </span>
          </p>
        </div>

        <HeroArt />
      </div>
    </section>
  );
}
