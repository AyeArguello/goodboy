"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/data/admin";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { detectImageMime } from "@/lib/receipts/fileValidation";
import { readImageSize } from "@/lib/domain/imageSize";
import {
  GALLERY_BUCKET,
  GALLERY_EXTENSION_MIME,
  GALLERY_PATH_PATTERN,
  MAX_GALLERY_CAPTION,
  MAX_GALLERY_PHOTOS,
  isGalleryExtension,
  newGalleryPath,
  type GalleryExtension,
} from "@/lib/domain/gallery";

export type GalleryActionResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: string };

const FULL_MESSAGE = `La galería ya tiene ${MAX_GALLERY_PHOTOS} fotos. Quitá alguna para poder subir otra.`;

function friendly(message: string): string {
  if (message.includes("GALLERY_FULL")) return FULL_MESSAGE;
  if (message.includes("NOT_AUTHORIZED"))
    return "Tu sesión venció. Volvé a iniciar sesión.";
  if (message.includes("PHOTO_NOT_FOUND"))
    return "Esa foto ya no está en la galería.";
  return "No se pudo completar la operación. Probá de nuevo.";
}

function revalidateGallery() {
  revalidatePath("/");
  revalidatePath("/galeria");
  revalidatePath("/admin/galeria");
}

async function countPhotos(): Promise<number | null> {
  const { count, error } = await getServiceSupabaseClient()
    .from("gallery_photos")
    .select("id", { count: "exact", head: true });
  return error ? null : (count ?? 0);
}

/**
 * Step 1 of an upload: checks the admin session and that there is room, then
 * hands the browser a one-time signed URL to put the file in Storage. The file
 * never goes through the server, so there is no request-size limit to hit.
 */
export async function prepareGalleryUpload(
  extension: string,
): Promise<GalleryActionResult<{ path: string; token: string }>> {
  if (!(await getAdminSession()))
    return { ok: false, error: friendly("NOT_AUTHORIZED") };
  if (!isGalleryExtension(extension)) {
    return { ok: false, error: "Subí una imagen JPG, PNG o WebP." };
  }

  const count = await countPhotos();
  if (count === null) return { ok: false, error: friendly("") };
  if (count >= MAX_GALLERY_PHOTOS) return { ok: false, error: FULL_MESSAGE };

  const path = newGalleryPath(extension as GalleryExtension);
  const { data, error } = await getServiceSupabaseClient()
    .storage.from(GALLERY_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: friendly("") };
  return { ok: true, path, token: data.token };
}

/**
 * Step 2: the browser finished uploading. The server downloads the file,
 * checks the real bytes (type and size from the header, not from what the
 * browser claims) and only then registers it in the database, where a trigger
 * enforces the 25-photo limit. Anything that fails removes the uploaded file,
 * so Storage never keeps files the gallery does not know about.
 */
export async function registerGalleryPhoto(
  path: string,
  caption: string,
): Promise<GalleryActionResult> {
  if (!(await getAdminSession()))
    return { ok: false, error: friendly("NOT_AUTHORIZED") };
  if (!GALLERY_PATH_PATTERN.test(path)) {
    return { ok: false, error: "La foto no es válida." };
  }

  const storage = getServiceSupabaseClient().storage.from(GALLERY_BUCKET);
  const discard = async () => {
    await storage.remove([path]);
  };

  const { data: file, error: downloadError } = await storage.download(path);
  if (downloadError || !file) return { ok: false, error: friendly("") };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageMime(bytes);
  const extension = path.slice(path.lastIndexOf(".") + 1) as GalleryExtension;
  const size = readImageSize(bytes);
  if (!mime || mime !== GALLERY_EXTENSION_MIME[extension] || !size) {
    await discard();
    return { ok: false, error: "El archivo no es una imagen válida." };
  }

  const supabase = await getServerSupabaseClient();
  const { error } = await supabase.rpc("admin_add_gallery_photo", {
    p_storage_path: path,
    p_caption: caption.trim().slice(0, MAX_GALLERY_CAPTION),
    p_width: size.width,
    p_height: size.height,
  });
  if (error) {
    await discard();
    return { ok: false, error: friendly(error.message) };
  }

  revalidateGallery();
  return { ok: true };
}

/** Removes the photo from the gallery and its file from Storage. */
export async function deleteGalleryPhoto(
  id: string,
): Promise<GalleryActionResult> {
  if (!(await getAdminSession()))
    return { ok: false, error: friendly("NOT_AUTHORIZED") };

  const supabase = await getServerSupabaseClient();
  const { data: path, error } = await supabase.rpc(
    "admin_delete_gallery_photo",
    {
      p_id: id,
    },
  );
  if (error) return { ok: false, error: friendly(error.message) };

  if (typeof path === "string") {
    const { error: removeError } = await getServiceSupabaseClient()
      .storage.from(GALLERY_BUCKET)
      .remove([path]);
    // The photo is already gone from the gallery; a stray file only wastes space.
    if (removeError) console.error("gallery file not removed:", path);
  }

  revalidateGallery();
  return { ok: true };
}
