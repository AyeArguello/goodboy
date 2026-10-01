"use client";

import { useState } from "react";
import Image from "next/image";
import { CtaLink } from "@/components/ui/Link";
import { nav } from "@/lib/content/landing";
import { businessConfig } from "@/lib/config/business";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-lavender-100 sticky top-0 z-20 border-b bg-white/96 backdrop-blur">
      <div className="mx-auto flex min-h-[72px] max-w-[1280px] items-center gap-6 px-4 py-2 sm:px-8">
        <a
          href="#inicio"
          aria-label={`${businessConfig.name} — inicio`}
          className="flex shrink-0"
        >
          <Image
            src="/images/logo-good-boy.jpg"
            alt={businessConfig.name}
            width={64}
            height={64}
            className="block size-16"
            priority
          />
        </a>

        <nav
          aria-label="Secciones"
          className="hidden flex-1 justify-center gap-1 lg:flex"
        >
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="font-heading text-charcoal hover:bg-lavender-100 flex min-h-11 items-center rounded-full px-2.5 text-sm font-semibold no-underline"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <CtaLink href="/turnos" size="md">
            Solicitar turno
          </CtaLink>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Abrir menú"
            className="border-charcoal flex size-12 cursor-pointer items-center justify-center rounded-full border-[1.5px] bg-white lg:hidden"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="#25282C"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 6h14M3 10h14M3 14h14" />
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          aria-label="Menú"
          className="border-lavender-100 grid gap-0.5 border-t bg-white px-4 pt-2 pb-4 lg:hidden"
        >
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setMenuOpen(false)}
              className="border-lavender-100 font-heading text-charcoal flex min-h-12 items-center border-b text-[17px] font-semibold no-underline"
            >
              {n.label}
            </a>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
