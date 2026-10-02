/** Private Supabase Storage bucket for payment receipts — never public. */
export const RECEIPT_BUCKET = "payment-receipts";

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const MAX_RECEIPT_FILES = 2;
export const RECEIPT_REFERENCE_MAX_LENGTH = 60;

/** How long an admin's signed URL to a receipt stays valid. */
export const ADMIN_SIGNED_URL_SECONDS = 60;

export const RECEIPT_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ReceiptMime = keyof typeof RECEIPT_MIME_TO_EXT;
export type ReceiptExt = (typeof RECEIPT_MIME_TO_EXT)[ReceiptMime];

export const RECEIPT_MIMES = Object.keys(RECEIPT_MIME_TO_EXT) as ReceiptMime[];

/** Object names are random (`r/<uuid>.<ext>`) and carry no personal data. */
export const RECEIPT_PATH_PATTERN =
  /^r\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function isReceiptMime(value: unknown): value is ReceiptMime {
  return typeof value === "string" && value in RECEIPT_MIME_TO_EXT;
}
