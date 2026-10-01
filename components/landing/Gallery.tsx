"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog } from "@/components/ui/Dialog";
import { PlaceholderPhoto } from "@/components/ui/PlaceholderPhoto";
import { cn } from "@/lib/ui/cn";
import { galleryItems } from "@/lib/content/landing";

const PAGE_SIZE = 4;
const PAGE_COUNT = Math.ceil(galleryItems.length / PAGE_SIZE);
/** Every source photo happens to be portrait-ish; used only until the real ratio loads. */
const FALLBACK_RATIO = 0.7;

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

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

export function Gallery() {
  const [page, setPage] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const current = openIndex !== null ? galleryItems[openIndex] : null;

  // Pre-read each photo's real aspect ratio so the lightbox border can hug
  // the actual image instead of a fixed letterboxed box.
  useEffect(() => {
    galleryItems.forEach((g) => {
      const src = g.src;
      if (!src) return;
      const img = new window.Image();
      img.onload = () => {
        setImageRatios((prev) =>
          src in prev
            ? prev
            : { ...prev, [src]: img.naturalWidth / img.naturalHeight },
        );
      };
      img.src = src;
    });
  }, []);

  const pageItems = galleryItems
    .map((item, index) => ({ item, index }))
    .slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function goToPage(next: number) {
    setPage(Math.min(Math.max(next, 0), PAGE_COUNT - 1));
  }

  function step(delta: number) {
    setOpenIndex((i) =>
      i === null
        ? null
        : (i + delta + galleryItems.length) % galleryItems.length,
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
          {pageItems.map(({ item: g, index: i }) => (
            <li key={g.id}>
              <div className="border-lavender relative aspect-square overflow-hidden rounded-lg border-2">
                {g.src ? (
                  <Image
                    src={g.src}
                    alt={g.caption}
                    fill
                    sizes="(min-width: 768px) 25vw, 50vw"
                    className="object-cover"
                  />
                ) : (
                  <PlaceholderPhoto
                    label={`Foto real ${i + 1}`}
                    className="size-full"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setOpenIndex(i)}
                  aria-label={`Ampliar foto: ${g.caption}`}
                  className="border-charcoal absolute right-2.5 bottom-2.5 flex size-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] bg-white"
                >
                  <ExpandIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {PAGE_COUNT > 1 ? (
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
              aria-label="Página anterior de la galería"
              className="border-lavender-100 text-charcoal flex size-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronIcon direction="left" />
            </button>
            <div
              className="flex items-center gap-2"
              role="group"
              aria-label="Páginas de la galería"
            >
              {Array.from({ length: PAGE_COUNT }, (_, p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => goToPage(p)}
                  aria-label={`Ir a la página ${p + 1} de la galería`}
                  aria-current={p === page ? "true" : undefined}
                  className={cn(
                    "size-2.5 cursor-pointer rounded-full transition-colors",
                    p === page ? "bg-purple" : "bg-lavender-100",
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page === PAGE_COUNT - 1}
              aria-label="Página siguiente de la galería"
              className="border-lavender-100 text-charcoal flex size-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>
        ) : null}
        <p aria-live="polite" className="sr-only">
          Página {page + 1} de {PAGE_COUNT}
        </p>
      </div>

      <Dialog
        open={current !== null}
        onClose={() => setOpenIndex(null)}
        label="Foto ampliada"
      >
        {current ? (
          <div
            className="relative flex w-[min(90vw,900px)] flex-col items-center gap-4 p-6"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") step(1);
              if (e.key === "ArrowLeft") step(-1);
            }}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(null)}
              aria-label="Cerrar"
              className="absolute top-4 right-4 z-10 flex size-12 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-white text-2xl text-white"
            >
              ×
            </button>
            <div
              className="border-lavender relative max-w-full overflow-hidden rounded-xl border-2"
              style={{
                height: "70vh",
                width: current.src
                  ? `calc(70vh * ${imageRatios[current.src] ?? FALLBACK_RATIO})`
                  : undefined,
              }}
            >
              {current.src ? (
                <Image
                  src={current.src}
                  alt={current.caption}
                  fill
                  sizes="90vw"
                  className="object-contain"
                />
              ) : (
                <PlaceholderPhoto
                  label={current.caption}
                  className="size-full"
                />
              )}
            </div>
            <div className="flex w-full items-center gap-4 text-white">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Foto anterior"
                className="flex size-12 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-white"
              >
                ‹
              </button>
              <p className="m-0 flex-1 text-center">
                <span className="text-lavender">
                  {(openIndex ?? 0) + 1} de {galleryItems.length}
                </span>
              </p>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Foto siguiente"
                className="flex size-12 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-white"
              >
                ›
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
