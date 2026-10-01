import type { MetadataRoute } from "next";
import { businessConfig } from "@/lib/config/business";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: businessConfig.name,
    short_name: "Good Boy",
    description: "Peluquería canina con turnos planificados.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF8FC",
    theme_color: "#684E7A",
    icons: [
      {
        src: "/images/logo-good-boy.jpg",
        sizes: "192x192",
        type: "image/jpeg",
      },
      {
        src: "/images/logo-good-boy.jpg",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
  };
}
