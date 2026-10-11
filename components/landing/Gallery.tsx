import { GalleryPreview } from "@/components/landing/GalleryPreview";
import { getGalleryPhotos } from "@/lib/data/gallery";
import { HOME_GALLERY_COUNT } from "@/lib/domain/gallery";

/** Landing-page gallery: the newest few photos, with a way to see them all. */
export async function Gallery() {
  const photos = await getGalleryPhotos({ limit: HOME_GALLERY_COUNT });
  // No photos yet (or the gallery could not be read): leave the section out
  // rather than showing an empty frame.
  if (photos.length === 0) return null;
  return <GalleryPreview photos={photos} />;
}
