import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { TrustStrip } from "@/components/landing/TrustStrip";
import { Services } from "@/components/landing/Services";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { Gallery } from "@/components/landing/Gallery";
import { Transport } from "@/components/landing/Transport";
import { TurnosPreview } from "@/components/landing/TurnosPreview";
import { Faq } from "@/components/landing/Faq";
import { Contact } from "@/components/landing/Contact";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { getUpcomingAvailability } from "@/lib/data/availability";
import { faqPageJsonLd, localBusinessJsonLd } from "@/lib/seo/jsonld";

// The "próximo horario" teaser is secondary to /turnos (the actual booking
// picker, which is force-dynamic) — revalidating every minute keeps it
// close to live without paying full SSR cost on every homepage hit.
export const revalidate = 60;

export default async function HomePage() {
  const days = await getUpcomingAvailability();
  const nextSlot = days[0];

  return (
    <>
      <JsonLd data={localBusinessJsonLd()} />
      <JsonLd data={faqPageJsonLd()} />
      <Header />
      <main>
        <Hero nextSlot={nextSlot} />
        <TrustStrip />
        <Services />
        <HowItWorks />
        <Pricing />
        <Gallery />
        <Transport />
        <TurnosPreview days={days} />
        <Faq />
        <Contact />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
