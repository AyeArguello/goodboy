"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PrivacyContent } from "./PrivacyContent";
import { TermsContent } from "./TermsContent";

type Doc = "privacy" | "terms";

const TITLES: Record<Doc, string> = {
  privacy: "Política de privacidad",
  terms: "Términos de reserva",
};

function DocIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}

/**
 * Buttons that open the privacy policy and the booking terms in a dialog, so
 * the person can read them without leaving the request they are filling in.
 */
export function LegalDialogs() {
  const [open, setOpen] = useState<Doc | null>(null);

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-ink-soft m-0 text-sm">
        Podés leer los textos completos antes de aceptar:
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen("privacy")}
        >
          <DocIcon /> Política de privacidad
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setOpen("terms")}>
          <DocIcon /> Términos de reserva
        </Button>
      </div>

      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        label={open ? TITLES[open] : "Documento legal"}
      >
        {open ? (
          <div className="flex max-h-[85dvh] w-[min(94vw,720px)] flex-col overflow-hidden rounded-xl bg-white">
            <div className="border-lavender flex items-center justify-between gap-3 border-b px-5 py-4">
              <h2 className="font-heading text-charcoal m-0 text-xl font-bold">
                {TITLES[open]}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Cerrar"
                className="text-charcoal hover:bg-lavender-100 grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-2xl leading-none"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
              {open === "privacy" ? (
                <PrivacyContent sectionLevel="h3" />
              ) : (
                <TermsContent
                  sectionLevel="h3"
                  privacyLink={
                    <button
                      type="button"
                      onClick={() => setOpen("privacy")}
                      className="text-purple hover:text-charcoal cursor-pointer underline"
                    >
                      política de privacidad
                    </button>
                  }
                />
              )}
            </div>
            <div className="border-lavender border-t px-5 py-4">
              <Button
                size="md"
                className="w-full"
                onClick={() => setOpen(null)}
              >
                Entendido
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
