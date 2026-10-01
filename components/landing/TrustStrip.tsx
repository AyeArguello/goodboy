import { trustItems } from "@/lib/content/landing";

export function TrustStrip() {
  return (
    <section aria-label="Cómo trabajamos" className="bg-lavender-100">
      <ul className="mx-auto grid max-w-[1280px] list-none grid-cols-1 gap-5 px-5 py-7 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {trustItems.map((t) => (
          <li key={t.title} className="flex items-start gap-3.5">
            <span className="border-charcoal flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-white">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#25282C"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={t.icon} />
              </svg>
            </span>
            <span className="flex flex-col">
              <strong className="font-heading text-base leading-tight font-bold">
                {t.title}
              </strong>
              <span className="text-ink-soft text-[15px] leading-snug">
                {t.text}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
