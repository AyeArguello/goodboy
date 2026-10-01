import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config/business";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/turnos/estado"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
