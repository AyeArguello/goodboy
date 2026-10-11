import "server-only";
import { getPublicEnv } from "@/lib/env/public";
import { getPublicSupabaseClient } from "@/lib/supabase/public";
import { galleryPhotoUrl, type GalleryPhoto } from "@/lib/domain/gallery";

interface GalleryRow {
  id: string;
  storage_path: string;
  caption: string;
  width: number;
  height: number;
}

/**
 * The gallery, newest photo first. Public data (the table is readable by
 * everyone), so it uses the anon client and never throws: a failure just
 * means an empty gallery, never a broken page.
 */
export async function getGalleryPhotos(
  opts: { limit?: number } = {},
): Promise<GalleryPhoto[]> {
  try {
    const supabaseUrl = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL;
    let query = getPublicSupabaseClient()
      .from("gallery_photos")
      .select("id, storage_path, caption, width, height")
      .order("created_at", { ascending: false });
    if (opts.limit) query = query.limit(opts.limit);

    const { data, error } = await query;
    if (error || !data) return [];
    return (data as GalleryRow[]).map((row) => ({
      id: row.id,
      url: galleryPhotoUrl(supabaseUrl, row.storage_path),
      caption: row.caption,
      width: row.width,
      height: row.height,
    }));
  } catch {
    return [];
  }
}
