import Image from "next/image";
import { CtaLink } from "@/components/ui/Link";
import { businessConfig } from "@/lib/config/business";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";
import type { DayAvailabilityPreview } from "@/lib/data/availability";

function WhatsAppIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#25282C"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
      <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.3-2.3l.8-1-1-2z" />
    </svg>
  );
}

export function Hero({
  nextSlot,
}: {
  nextSlot: DayAvailabilityPreview | undefined;
}) {
  const nextSlotText = nextSlot
    ? `${nextSlot.dayLabel} · ${nextSlot.slotLabels[0]}`
    : "Publicamos horarios de a poco — todavía sin próximo turno";

  return (
    <section id="inicio" className="relative overflow-hidden bg-white">
      <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-5 py-12 sm:px-8 md:grid-cols-2 md:gap-16 md:py-20">
        <div className="flex flex-col gap-6">
          <p className="font-heading text-purple m-0 text-sm font-semibold tracking-[0.14em] uppercase">
            {businessConfig.address.street} · Lunes a sábado, con turno
          </p>
          <h1 className="font-heading text-charcoal m-0 text-[clamp(34px,5.2vw,64px)] leading-[1.08] font-bold tracking-tight text-balance">
            Peluquería canina con atención personalizada en{" "}
            <span className="border-purple bg-lavender-100 text-purple rounded-md border-b-2 border-dashed px-1.5">
              {businessConfig.address.city}
            </span>
          </h1>
          <p className="text-ink-soft m-0 max-w-[34em] text-[clamp(17px,1.6vw,20px)] text-pretty">
            Baño, secado y corte con turnos planificados para dedicarle a cada
            perro el tiempo que necesita.
          </p>
          <div className="flex flex-wrap gap-3">
            <CtaLink href="/turnos">Solicitar un turno</CtaLink>
            <CtaLink
              href={businessWhatsAppLink()}
              variant="secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon />
              Hablar por WhatsApp
            </CtaLink>
          </div>
          <div className="border-lavender-100 flex max-w-[30em] items-center gap-3 border-t pt-2">
            <span className="bg-purple size-2.5 shrink-0 rounded-full" />
            <p className="text-ink-soft m-0 text-[15px]">
              Próximo horario publicado:{" "}
              <strong className="text-charcoal font-bold">
                {nextSlotText}
              </strong>
            </p>
          </div>
        </div>
        <div className="relative aspect-4/5 max-h-[620px] w-full overflow-hidden rounded-[clamp(120px,18vw,260px)_clamp(120px,18vw,260px)_28px_28px]">
          <Image
            src="/images/perros/perrito1.webp"
            alt="Perro recién bañado y peinado en Good Boy"
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
