import { CtaLink } from "@/components/ui/Link";
import type { DayAvailabilityPreview } from "@/lib/data/availability";

export function TurnosPreview({ days }: { days: DayAvailabilityPreview[] }) {
  return (
    <section id="turnos" className="bg-charcoal text-white">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 sm:px-8 md:grid-cols-2 md:gap-16 md:py-24">
        <div className="flex flex-col gap-4">
          <p className="font-heading text-lavender m-0 text-sm font-semibold tracking-[0.14em] uppercase">
            Turnero
          </p>
          <h2 className="font-heading m-0 text-[clamp(28px,3.4vw,44px)] leading-tight font-bold tracking-tight text-balance">
            Horarios publicados
          </h2>
          <p className="text-lavender-100 m-0 max-w-[30em]">
            Publicamos los horarios de a poco para que nadie espere. Se pide con
            al menos 24 horas de anticipación y cada solicitud queda pendiente
            hasta que verifiquemos la seña y te confirmemos por email.
          </p>
          <div className="pt-2">
            <CtaLink href="/turnos" onDark>
              Ver todos los horarios
            </CtaLink>
          </div>
        </div>
        <ul className="text-charcoal m-0 flex list-none flex-col rounded-xl bg-white px-4 py-2 sm:px-6">
          {days.length === 0 ? (
            <li className="text-ink-soft flex min-h-11 items-center py-4 text-[15px]">
              Todavía sin horarios publicados
            </li>
          ) : (
            days.map((d, i) => (
              <li
                key={d.dateKey}
                className={`flex flex-wrap items-center gap-4 py-3.5 ${i === days.length - 1 ? "" : "border-lavender-100 border-b"}`}
              >
                <span className="flex min-w-[112px] flex-col leading-tight">
                  <strong className="font-heading text-base font-bold">
                    {d.dayLabel}
                  </strong>
                </span>
                <span className="flex flex-wrap gap-2">
                  {d.slotLabels.map((s) => (
                    <CtaLink
                      key={s}
                      href="/turnos"
                      variant="secondary"
                      size="sm"
                      className="tabular-nums"
                    >
                      {s}
                    </CtaLink>
                  ))}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
