import { Accordion } from "@/components/ui/Accordion";
import { faqs } from "@/lib/content/landing";

export function Faq() {
  return (
    <section
      id="preguntas"
      className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-14 sm:px-8 md:py-24"
    >
      <div className="flex flex-col gap-3">
        <p className="font-heading text-purple m-0 text-sm font-semibold tracking-[0.14em] uppercase">
          Preguntas frecuentes
        </p>
        <h2 className="font-heading text-charcoal m-0 text-[clamp(28px,3.4vw,44px)] leading-tight font-bold tracking-tight">
          Antes de pedir turno
        </h2>
      </div>
      <Accordion
        items={faqs().map((f) => ({ question: f.question, answer: f.answer }))}
      />
    </section>
  );
}
