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
      </div>
    </footer>
  );
}
