import { businessConfig, siteUrl } from "@/lib/config/business";
import { faqs } from "@/lib/content/landing";

/**
 * Built from the same businessConfig/faqs() the UI renders — one source of
 * truth, so JSON-LD can never drift from what's visible on the page (and
 * never claims data that isn't confirmed: no geo coordinates, no sameAs
 * profiles, until those exist).
 */
export function localBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: businessConfig.name,
    image: `${siteUrl()}/images/logo-good-boy.jpg`,
    url: siteUrl(),
    address: {
      "@type": "PostalAddress",
      streetAddress: businessConfig.address.street,
      addressLocality: businessConfig.address.city,
      addressRegion: businessConfig.address.province,
      addressCountry: businessConfig.address.countryCode,
    },
    areaServed: businessConfig.address.city,
    priceRange: "ARS 30.000–70.000",
    openingHoursDescription: businessConfig.businessHoursText,
    ...(businessConfig.socialProofSameAs.length > 0
      ? { sameAs: businessConfig.socialProofSameAs }
      : {}),
  };
}

export function faqPageJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs().map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}
