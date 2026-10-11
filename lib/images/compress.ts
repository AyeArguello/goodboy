import type { GalleryExtension } from "@/lib/domain/gallery";

export interface CompressedImage {
  blob: Blob;
  extension: GalleryExtension;
}

const MAX_SIDE = 1600;

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Shrinks a photo in the browser before it is uploaded: longest side at most
 * 1600 px, re-encoded as WebP (JPEG where the browser cannot write WebP). Phone
 * photos of several MB become a few hundred KB, and the re-encoding bakes in
 * the camera rotation and drops location metadata.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const webp = await toBlob(canvas, "image/webp", 0.82);
    if (webp && webp.type === "image/webp") {
      return { blob: webp, extension: "webp" };
    }
    const jpeg = await toBlob(canvas, "image/jpeg", 0.85);
    if (!jpeg) throw new Error("encode");
    return { blob: jpeg, extension: "jpg" };
  } finally {
    bitmap.close();
  }
}
