import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Montserrat, Nunito_Sans } from "next/font/google";
import { WhatsAppFloat } from "@/components/landing/WhatsAppFloat";
import { businessConfig, siteUrl } from "@/lib/config/business";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    template: `%s · ${businessConfig.name}`,
    default: `${businessConfig.name} en ${businessConfig.address.city}`,
  },
  description:
    "Baño, secado y corte con turnos planificados. Pedí tu turno con al menos 24 horas de anticipación.",
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: businessConfig.name,
  },
};

/**
 * Runs before the first paint: when this browser session already saw the home
 * intro, flag it so the overlay never flashes and the hero starts at once.
 */
const introMemory = `try{if(sessionStorage.getItem("gb-intro")==="1")document.documentElement.setAttribute("data-intro","seen")}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      data-scroll-behavior="smooth"
      className={`${montserrat.variable} ${nunitoSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: introMemory }} />
      </head>
      <body className="bg-canvas text-charcoal flex min-h-screen flex-col antialiased">
        {children}
        <WhatsAppFloat />
      </body>
    </html>
  );
}
