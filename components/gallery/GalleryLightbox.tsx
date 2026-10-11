"use client";

import Image from "next/image";
import { Dialog } from "@/components/ui/Dialog";
import { galleryAltText, type GalleryPhoto } from "@/lib/domain/gallery";

/**
 * Full-size view of one photo, with previous/next. Built on the native
 * <dialog>, so Esc closes it, focus stays inside and goes back to the photo
 * that opened it. Arrow keys move between photos.
 */
export function GalleryLightbox({
  photos,
  index,
  onClose,
  onStep,
}: {
  photos: GalleryPhoto[];
  /** Index of the open photo, or null when closed. */
  index: number | null;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const photo = index !== null ? photos[index] : null;

  return (
    <Dialog open={photo != null} onClose={onClose} label="Foto ampliada">
      {photo ? (
        <div
          className="relative flex w-[min(94vw,1000px)] flex-col items-center gap-4 p-3 sm:p-6"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") onStep(1);
            if (e.key === "ArrowLeft") onStep(-1);
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-2 right-2 z-10 flex size-12 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-white bg-black/40 text-2xl text-white sm:top-4 sm:right-4"
          >
            <span aria-hidden="true">×</span>
          </button>

          <Image
            key={photo.id}
            src={photo.url}
            alt={galleryAltText(photo.caption)}
            width={photo.width}
            height={photo.height}
            unoptimized
            sizes="94vw"
            className="border-lavender h-auto max-h-[72dvh] w-auto max-w-full rounded-xl border-2 object-contain"
          />

          <div className="flex w-full items-center gap-4 text-white">
            <button
              type="button"
              onClick={() => onStep(-1)}
              aria-label="Foto anterior"
              disabled={photos.length < 2}
              className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-white text-2xl disabled:opacity-30"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <p className="m-0 flex-1 text-center">
              {photo.caption ? (
                <span className="block text-[15px]">{photo.caption}</span>
              ) : null}
              <span className="text-lavender text-sm">
                {(index ?? 0) + 1} de {photos.length}
              </span>
            </p>
            <button
              type="button"
              onClick={() => onStep(1)}
              aria-label="Foto siguiente"
              disabled={photos.length < 2}
              className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-white text-2xl disabled:opacity-30"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
