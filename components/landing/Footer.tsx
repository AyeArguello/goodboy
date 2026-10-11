import Image from "next/image";
import { businessConfig } from "@/lib/config/business";

export function Footer() {
  return (
    <footer className="border-lavender-100 border-t bg-white">
      <div className="mx-auto grid max-w-7xl items-start gap-8 px-5 py-10 sm:grid-cols-3 sm:px-8">
        <Image
          src="/images/logo-good-boy.jpg"
          alt={businessConfig.name}
          width={112}
          height={112}
          className="size-28"
        />
        <div className="text-ink-soft flex flex-col gap-1 text-[15px]">
          <strong className="font-heading text-charcoal">Dirección</strong>
          <span>{businessConfig.address.street}</span>
          <span className="text-purple">
            {businessConfig.address.city}, {businessConfig.address.province}
          </span>
        </div>
        <div className="text-ink-soft flex flex-col gap-1 text-[15px]">
          <strong className="font-heading text-charcoal">Horario</strong>
          <span>{businessConfig.businessHoursText}</span>
          <span className="text-purple">
            WhatsApp: {businessConfig.whatsappNumberE164}
          </span>
          <a
            href={businessConfig.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple"
          >
            Instagram @goodboy.peluca
          </a>
        </div>
        <nav
          aria-label="Legales"
          className="flex flex-col text-[15px] sm:col-span-3"
        >
          <a href="/privacidad" className="flex min-h-11 items-center">
            Política de privacidad
          </a>
          <a href="/terminos-de-reserva" className="flex min-h-11 items-center">
            Términos de reserva
          </a>
          <span className="text-ink-soft">
            © {new Date().getFullYear()} {businessConfig.legalDisclaimerName}
          </span>
        </nav>
        <div className="border-lavender-100 flex justify-center border-t pt-6 sm:col-span-3 sm:justify-start">
          <a
            href="https://gecdigital.dev/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Sitio realizado por GEC Soluciones Digitales (abre en una pestaña nueva)"
            className="credit-lockup border-lavender hover:border-purple hover:bg-lavender-100 text-charcoal press group inline-flex max-w-full items-center gap-3 rounded-full border-[1.5px] bg-white py-2 pr-5 pl-2 no-underline"
          >
            <Image
              src="/logo-gec.png"
              alt=""
              width={722}
              height={608}
              className="credit-logo size-12 shrink-0 object-contain"
            />
            <span className="flex min-w-0 flex-col text-left leading-tight">
              <span className="text-ink-soft text-xs">Sitio realizado por</span>
              <span className="font-heading text-[15px] font-bold">
                GEC Soluciones Digitales
              </span>
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-purple shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            >
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
