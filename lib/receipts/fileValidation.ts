import {
  MAX_RECEIPT_BYTES,
  RECEIPT_MIME_TO_EXT,
  isReceiptMime,
  type ReceiptMime,
} from "./constants";

/**
 * Pure helpers (no Node APIs) so the browser can pre-check a chosen file with
 * the same rules the server enforces. The server never trusts this: it
 * re-validates the declared metadata and then the real bytes.
 */

export type FileCheck =
  | { ok: true; mime: ReceiptMime }
  | { ok: false; code: "EMPTY" | "TOO_LARGE" | "BAD_TYPE"; message: string };

const EXT_TO_MIME: Record<string, ReceiptMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

export const BAD_TYPE_MESSAGE =
  "Subí una imagen JPG, PNG o WebP. Una captura de pantalla del comprobante sirve.";

/** Checks what the client *declares* about a file: extension, MIME type and size. */
export function checkDeclaredFile(file: {
  name: string;
  type: string;
  size: number;
}): FileCheck {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, code: "EMPTY", message: "El archivo está vacío." };
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      code: "TOO_LARGE",
      message: "La imagen pesa más de 5 MB. Probá con una captura de pantalla.",
    };
  }
  const ext = extensionOf(file.name);
  const byExt = ext ? EXT_TO_MIME[ext] : undefined;
  if (!isReceiptMime(file.type) || !byExt || byExt !== file.type) {
    return { ok: false, code: "BAD_TYPE", message: BAD_TYPE_MESSAGE };
  }
  return { ok: true, mime: file.type };
}

/** Detects the real image type from the first bytes (magic numbers). */
export function detectImageMime(bytes: Uint8Array): ReceiptMime | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

export type ContentCheck =
  | {
      ok: true;
      mime: ReceiptMime;
      ext: (typeof RECEIPT_MIME_TO_EXT)[ReceiptMime];
    }
  | { ok: false; code: "EMPTY" | "TOO_LARGE" | "CONTENT_MISMATCH" };

/** Checks the bytes actually stored: size, real image type, and that it matches what was declared. */
export function checkStoredContent(
  bytes: Uint8Array,
  declaredMime: ReceiptMime,
): ContentCheck {
  if (bytes.length === 0) return { ok: false, code: "EMPTY" };
  if (bytes.length > MAX_RECEIPT_BYTES) return { ok: false, code: "TOO_LARGE" };
  const detected = detectImageMime(bytes);
  if (!detected || detected !== declaredMime) {
    return { ok: false, code: "CONTENT_MISMATCH" };
  }
  return { ok: true, mime: detected, ext: RECEIPT_MIME_TO_EXT[detected] };
}
