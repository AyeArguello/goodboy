import { CtaLink } from "@/components/ui/Link";

export function FinalCta() {
  return (
    <section className="bg-lavender relative overflow-hidden">
      <div
        aria-hidden="true"
        className="border-charcoal absolute top-7 left-[8%] size-4 rounded-full border-[1.5px]"
      />
      <div
        aria-hidden="true"
        className="bg-lavender-100 absolute right-[10%] bottom-9 size-7 rounded-full"
      />
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-5 py-16 text-center sm:px-8 md:py-24">
        <h2 className="font-heading text-charcoal m-0 text-[clamp(28px,4vw,48px)] leading-[1.12] font-bold tracking-tight text-balance">
          Pedí un turno con anticipación
        </h2>
        <p className="text-charcoal m-0 max-w-[32em] text-lg">
          Elegí un horario publicado y dejá tu solicitud. Te avisamos por email
          en cada paso hasta confirmar el turno.
        </p>
        <CtaLink
          href="/turnos"
          className="bg-charcoal! hover:bg-purple! text-white!"
        >
          Solicitar un turno
        </CtaLink>
      </div>
    </section>
  );
}
