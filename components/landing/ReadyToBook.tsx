import { CtaLink } from "@/components/ui/Link";
import { Reveal } from "@/components/motion/Reveal";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";
import type { DayAvailabilityPreview } from "@/lib/data/availability";
import { PawIcon } from "./PawIcon";

function WhatsAppMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

/**
 * The call to action, placed after the reader has been through how it works,
 * what is done and the prices: the request and WhatsApp buttons come once the
 * visitor has had the chance to read, not at the very top of the page.
 */
export function ReadyToBook({
  nextSlot,
}: {
  nextSlot: DayAvailabilityPreview | undefined;
}) {
  const nextSlotText = nextSlot
    ? `${nextSlot.dayLabel} · ${nextSlot.slotLabels[0]}`
    : "Todavía no hay un próximo horario disponible";

  return (
    <section id="acciones" className="bg-lavender-100">
      <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-5 py-14 text-center sm:px-8 md:py-20">
        <h2 className="font-heading text-charcoal m-0 text-[clamp(28px,3.6vw,44px)] leading-[1.12] font-bold tracking-tight text-balance">
          ¿Listo para pedir el turno de tu perro?
        </h2>
        <p className="text-charcoal m-0 max-w-[32em] text-lg text-pretty">
          Elegí un horario publicado y dejá tu solicitud, o escribinos si te
          quedó alguna duda.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <CtaLink href="/turnos" className="press">
            <PawIcon className="size-5" />
            Solicitar un turno
          </CtaLink>
          <CtaLink
            href={businessWhatsAppLink()}
            variant="secondary"
            target="_blank"
            rel="noopener noreferrer"
            className="press"
          >
            <WhatsAppMark />
            Hablar por WhatsApp
          </CtaLink>
        </div>
        <div className="border-lavender flex w-full max-w-md items-start justify-center gap-3 border-t pt-4 text-center">
          <span className="bg-purple mt-1.5 size-2.5 shrink-0 animate-pulse rounded-full" />
          <p className="text-ink-soft m-0 text-[15px]">
            Próximo horario publicado:{" "}
            <strong className="text-charcoal font-bold">{nextSlotText}</strong>
          </p>
        </div>
      </Reveal>
    </section>
  );
}
