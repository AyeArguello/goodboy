"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";

/** The WhatsApp logo mark (Simple Icons, CC0): speech bubble with the handset. */
function WhatsAppGlyph() {
  return (
    <svg
      width="30"
      height="30"
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
 * Floating "write to us on WhatsApp" button for the public pages. It is only a
 * wa.me link: nothing is sent until the visitor taps send in WhatsApp. It stays
 * out of the admin panel, and on the booking pages it sits above the sticky
 * Back/Continue bar so it never covers those buttons.
 */
export function WhatsAppFloat() {
  const pathname = usePathname();
  // On the home page the contact buttons are meant to come after the reader
  // has gone through how it works, what is done and the prices, so the
  // floating one waits until that block (#acciones) comes into view.
  const [reachedActions, setReachedActions] = useState(false);
  const waitsForActions = pathname === "/";

  useEffect(() => {
    if (!waitsForActions || reachedActions) return;
    const check = () => {
      const block = document.getElementById("acciones");
      if (block && block.getBoundingClientRect().top < window.innerHeight) {
        setReachedActions(true);
      }
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [waitsForActions, reachedActions]);

  if (pathname.startsWith("/admin")) return null;
  if (waitsForActions && !reachedActions) return null;

  const aboveStickyBar = pathname.startsWith("/turnos");

  return (
    <a
      href={businessWhatsAppLink()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp (se abre en otra pestaña)"
      className={`wa-float group fixed right-4 z-30 grid size-14 place-items-center rounded-full bg-[#15803d] text-white no-underline shadow-[0_6px_20px_rgba(37,40,44,0.28)] transition-[transform,background-color] duration-200 hover:bg-[#166534] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#15803d] active:scale-95 sm:right-6 ${
        aboveStickyBar ? "bottom-24 sm:bottom-24" : "bottom-4 sm:bottom-6"
      }`}
    >
      <WhatsAppGlyph />
      {/* A tooltip beside the circle, so the button itself never changes shape. */}
      <span
        aria-hidden="true"
        className="font-heading bg-charcoal pointer-events-none absolute top-1/2 right-full mr-3 hidden translate-x-1 -translate-y-1/2 rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-white opacity-0 shadow-[0_4px_14px_rgba(37,40,44,0.2)] transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 sm:block"
      >
        Escribinos
      </span>
    </a>
  );
}
