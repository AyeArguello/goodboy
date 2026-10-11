"use client";

import { useState } from "react";
import Image from "next/image";
import { GalleryLightbox } from "@/components/gallery/GalleryLightbox";
import { CtaLink } from "@/components/ui/Link";
import { galleryAltText, type GalleryPhoto } from "@/lib/domain/gallery";

function ExpandIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#25282C"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </svg>
  );
}

export function GalleryPreview({ photos }: { photos: GalleryPhoto[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function step(delta: number) {
    setOpenIndex((i) =>
      i === null ? null : (i + delta + photos.length) % photos.length,
    );
  }

  return (
    <section id="galeria" className="bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-14 sm:px-8 md:py-24">
        <div className="flex max-w-xl flex-col gap-3">
          <p className="font-heading text-purple m-0 text-sm font-semibold tracking-[0.14em] uppercase">
            Galería
          </p>
          <h2 className="font-heading text-charcoal m-0 text-[clamp(28px,3.4vw,44px)] leading-tight font-bold tracking-tight">
            Perros que pasaron por Good Boy
          </h2>
        </div>

        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:gap-4 md:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <div className="border-lavender relative aspect-square overflow-hidden rounded-lg border-2">
                <Image
                  src={photo.url}
                  alt={galleryAltText(photo.caption)}
                  fill
                  unoptimized
                  sizes="(min-width: 768px) 25vw, 50vw"
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  aria-label={`Ampliar foto: ${galleryAltText(photo.caption)}`}
                  className="border-charcoal absolute right-2.5 bottom-2.5 flex size-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] bg-white"
                >
                  <ExpandIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex justify-center">
          <CtaLink href="/galeria" variant="secondary" size="lg">
            Ver la galería completa
          </CtaLink>
        </div>
      </div>

      <GalleryLightbox
        photos={photos}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onStep={step}
      />
    </section>
  );
}
