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
import { ReadyToBook } from "@/components/landing/ReadyToBook";
import { IntroLoader } from "@/components/landing/IntroLoader";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { Reveal } from "@/components/motion/Reveal";
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
    <MotionProvider>
      <JsonLd data={localBusinessJsonLd()} />
      <JsonLd data={faqPageJsonLd()} />
      <IntroLoader />
      <Header />
      <main>
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <Services />
        <Pricing />
        <ReadyToBook nextSlot={nextSlot} />
        <Gallery />
        <Reveal>
          <Transport />
        </Reveal>
        <Reveal>
          <TurnosPreview days={days} />
        </Reveal>
        <Reveal>
          <Faq />
        </Reveal>
        <Reveal>
          <Contact />
        </Reveal>
        <FinalCta />
      </main>
      <Footer />
    </MotionProvider>
  );
}
