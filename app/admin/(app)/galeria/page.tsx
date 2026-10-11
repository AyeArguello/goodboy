import { GalleryManager } from "@/components/admin/GalleryManager";
import { getGalleryPhotos } from "@/lib/data/gallery";
import { MAX_GALLERY_PHOTOS } from "@/lib/domain/gallery";

export const dynamic = "force-dynamic";

export default async function GaleriaAdminPage() {
  const photos = await getGalleryPhotos();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-heading m-0 text-xl font-bold">Galería</h1>
        <span className="text-ink-soft text-sm">
          Las fotos que se ven en la web. Máximo {MAX_GALLERY_PHOTOS}; en la
          página de inicio se muestran las 4 más nuevas.
        </span>
      </div>
      <GalleryManager photos={photos} />
    </div>
  );
}
