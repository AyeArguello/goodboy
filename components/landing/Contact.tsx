"use client";

import { useState } from "react";
import { CtaLink } from "@/components/ui/Link";
import { businessConfig } from "@/lib/config/business";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";

function PinIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#25282C"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function Contact() {
  const [mapShown, setMapShown] = useState(false);
  const address = `${businessConfig.address.street}, ${businessConfig.address.city}, ${businessConfig.address.province}`;
  const mapEmbedSrc = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;

  return (
    <section id="contacto" className="bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-2 md:gap-16 md:py-24">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="font-heading text-purple m-0 text-sm font-semibold tracking-[0.14em] uppercase">
              Dónde estamos
            </p>
            <h2 className="font-heading text-charcoal m-0 text-[clamp(28px,3.4vw,44px)] leading-tight font-bold tracking-tight">
              {businessConfig.address.street}
            </h2>
            <p className="text-purple m-0">
              {businessConfig.address.city}, {businessConfig.address.province}{" "}
              (CP {businessConfig.address.postalCode})
            </p>
          </div>
          <dl className="border-charcoal m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 border-t-[1.5px] pt-5">
            <dt className="font-heading font-semibold">Horario</dt>
            <dd className="text-ink-soft m-0">
              {businessConfig.businessHoursText}
            </dd>
            <dt className="font-heading font-semibold">WhatsApp</dt>
            <dd className="text-purple m-0">
              {businessConfig.whatsappNumberE164}
            </dd>
            <dt className="font-heading font-semibold">Instagram</dt>
            <dd className="m-0">
              <a
                href={businessConfig.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple"
              >
                @goodboy.peluca
              </a>
            </dd>
            <dt className="font-heading font-semibold">Turnos</dt>
            <dd className="text-ink-soft m-0">
              Con al menos {businessConfig.rules.minLeadHours} h de anticipación
            </dd>
          </dl>
          <div className="flex flex-wrap gap-3">
            <CtaLink
              href={businessWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
            >
              Escribir por WhatsApp
            </CtaLink>
            <CtaLink
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
              variant="secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cómo llegar
            </CtaLink>
          </div>
        </div>
        <div className="bg-lavender-100 relative flex min-h-80 items-center justify-center overflow-hidden rounded-xl p-6">
          {mapShown ? (
            <iframe
              title="Ubicación de Good Boy"
              src={mapEmbedSrc}
              className="absolute inset-0 size-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="flex max-w-[300px] flex-col items-center gap-3.5 text-center">
              <PinIcon />
              <p className="text-charcoal m-0 text-[15px]">
                El mapa se carga solo si lo pedís, para que la página sea más
                liviana.
              </p>
              <button
                type="button"
                onClick={() => setMapShown(true)}
                className="border-charcoal font-heading text-charcoal flex min-h-12 cursor-pointer items-center rounded-full border-[1.5px] bg-white px-5 text-[15px] font-semibold"
              >
                Mostrar mapa
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
