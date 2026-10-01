import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config/business";

// /privacidad and /terminos-de-reserva are noindex while their content is
// still [PENDIENTE] (see docs/assumptions.md §2) — a sitemap entry for a
// noindex page is a mixed signal to crawlers, so they're added back here
// once the legal text is confirmed and the noindex is lifted.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/turnos`, changeFrequency: "weekly", priority: 0.8 },
  ];
}
