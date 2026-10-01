"use client";

import { useState } from "react";

export interface AccordionItem {
  question: string;
  answer: string;
}

/** Single-open accordion (FAQ). One panel open at a time, matching the design. */
export function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="border-charcoal border-t-[1.5px]">
      {items.map((item, i) => {
        const open = openIndex === i;
        const panelId = `faq-panel-${i}`;
        return (
          <div key={item.question} className="border-lavender border-b">
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : i)}
                className="font-heading text-charcoal flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 bg-none py-5 text-left text-lg font-semibold"
              >
                <span>{item.question}</span>
                <span
                  aria-hidden="true"
                  className="border-charcoal flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] text-lg leading-none"
                >
                  {open ? "−" : "+"}
                </span>
              </button>
            </h3>
            {open ? (
              <p
                id={panelId}
                className="text-ink-soft mb-5 max-w-[44em] text-[17px]"
              >
                {item.answer}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
