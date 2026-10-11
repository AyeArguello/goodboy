/** Public Supabase Storage bucket for the gallery photos. */
export const GALLERY_BUCKET = "gallery";

/** Hard limit, also enforced by a trigger in the database. */
export const MAX_GALLERY_PHOTOS = 25;

/** Photos shown in the landing page; the rest live in /galeria. */
export const HOME_GALLERY_COUNT = 4;

export const MAX_GALLERY_CAPTION = 120;
export const DEFAULT_GALLERY_CAPTION = "Perro atendido en Good Boy";

export const GALLERY_EXTENSIONS = ["jpg", "png", "webp"] as const;
export type GalleryExtension = (typeof GALLERY_EXTENSIONS)[number];

/** Object names are random (`g/<uuid>.<ext>`) and never contain user text. */
export const GALLERY_PATH_PATTERN =
  /^g\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const GALLERY_EXTENSION_MIME: Record<GalleryExtension, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export interface GalleryPhoto {
  id: string;
  url: string;
  caption: string;
  width: number;
  height: number;
}

export function isGalleryExtension(value: unknown): value is GalleryExtension {
  return (
    typeof value === "string" &&
    (GALLERY_EXTENSIONS as readonly string[]).includes(value)
  );
}

export function newGalleryPath(extension: GalleryExtension): string {
  return `g/${crypto.randomUUID()}.${extension}`;
}

/** Public URL of a photo in the gallery bucket. */
export function galleryPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${GALLERY_BUCKET}/${path}`;
}

export function galleryAltText(caption: string): string {
  return caption.trim() || DEFAULT_GALLERY_CAPTION;
}
