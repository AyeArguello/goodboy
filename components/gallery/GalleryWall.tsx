"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { PawIcon } from "@/components/landing/PawIcon";
import { galleryAltText, type GalleryPhoto } from "@/lib/domain/gallery";
import { GalleryLightbox } from "./GalleryLightbox";

/** Even with a slow connection the wall appears after this long. */
const LOADER_TIMEOUT_MS = 8000;
/** Avoids a flash of the loader when every photo is already cached. */
const LOADER_MIN_MS = 600;

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Masonry wall (Pinterest-style columns) with every photo of the gallery.
 * A loader covers the wall until the images are in, then the photos rise in
 * one after another. The photos are in the server HTML, so nothing depends on
 * scripts to exist; the loader only hides the pop-in.
 */
export function GalleryWall({ photos }: { photos: GalleryPhoto[] }) {
  const [loaded, setLoaded] = useState(0);
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const counted = useRef(new Set<string>());
  const wall = useRef<HTMLUListElement>(null);

  const markLoaded = useCallback((id: string) => {
    if (counted.current.has(id)) return;
    counted.current.add(id);
    setLoaded(counted.current.size);
  }, []);

  useEffect(() => {
    // Photos that finished loading before hydration never fire onLoad.
    wall.current?.querySelectorAll("img").forEach((img) => {
      const id = img.dataset.photoId;
      if (id && img.complete) markLoaded(id);
    });
    const min = window.setTimeout(() => setMinElapsed(true), LOADER_MIN_MS);
    const max = window.setTimeout(() => setTimedOut(true), LOADER_TIMEOUT_MS);
    return () => {
      window.clearTimeout(min);
      window.clearTimeout(max);
    };
  }, [markLoaded]);

  const ready = minElapsed && (loaded >= photos.length || timedOut);
  const progress = photos.length
    ? Math.round((loaded / photos.length) * 100)
    : 100;

  function step(delta: number) {
    setOpenIndex((i) =>
      i === null ? null : (i + delta + photos.length) % photos.length,
    );
  }

  return (
    <div className="relative min-h-[60vh]">
      <noscript>
        <style>{`[data-gallery-item]{opacity:1!important;transform:none!important}[data-gallery-loader]{display:none!important}`}</style>
      </noscript>

      <ul
        ref={wall}
        className="m-0 list-none columns-2 gap-3 p-0 sm:gap-4 md:columns-3 lg:columns-4"
      >
        {photos.map((photo, index) => (
          <m.li
            key={photo.id}
            data-gallery-item
            className="mb-3 break-inside-avoid sm:mb-4"
            initial={{ opacity: 0, y: 28 }}
            animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
            transition={{
              duration: 0.6,
              ease: EASE,
              delay: ready ? Math.min(index * 0.05, 0.6) : 0,
            }}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={`Ampliar foto: ${galleryAltText(photo.caption)}`}
              className="group border-lavender focus-visible:outline-purple bg-lavender-100 relative block w-full cursor-zoom-in overflow-hidden rounded-xl border-2 p-0"
              style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
            >
              <Image
                src={photo.url}
                alt={galleryAltText(photo.caption)}
                width={photo.width}
                height={photo.height}
                unoptimized
                data-photo-id={photo.id}
                onLoad={() => markLoaded(photo.id)}
                onError={() => markLoaded(photo.id)}
                sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
              <span
                aria-hidden="true"
                className="absolute right-2.5 bottom-2.5 flex size-10 items-center justify-center rounded-full border-[1.5px] border-[#25282C] bg-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 max-md:opacity-100"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#25282C"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
                </svg>
              </span>
            </button>
          </m.li>
        ))}
      </ul>

      <AnimatePresence>
        {!ready ? (
          <m.div
            key="loader"
            data-gallery-loader
            role="status"
            aria-live="polite"
            className="bg-canvas absolute inset-0 z-10 flex flex-col items-center justify-start gap-4 pt-[18vh]"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4, ease: EASE } }}
          >
            <m.span
              className="text-purple"
              animate={{ y: [0, -14, 0], rotate: [0, -8, 8, 0] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <PawIcon className="size-14" />
            </m.span>
            <p className="font-heading text-charcoal m-0 text-lg font-bold">
              Cargando las fotos…
            </p>
            <div
              className="bg-lavender-100 h-1.5 w-48 overflow-hidden rounded-full"
              aria-hidden="true"
            >
              <m.div
                className="bg-purple h-full rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: EASE }}
              />
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

      <GalleryLightbox
        photos={photos}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onStep={step}
      />
    </div>
  );
}
