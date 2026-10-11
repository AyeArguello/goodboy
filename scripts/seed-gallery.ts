/**
 * One-off: uploads the original gallery photos to Supabase Storage and
 * registers them in `gallery_photos`, so the site shows them as before.
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/seed-gallery.ts <carpeta-con-las-fotos>
 *
 * Uses NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment (never printed). Against anything but a local Supabase it asks
 * for `--remote` on purpose: that writes to the real project. It does nothing
 * if the gallery already has photos.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readImageSize } from "../lib/domain/imageSize.ts";

// File name -> caption, newest first (the first one is shown first in the web).
const PHOTOS: [string, string][] = [
  ["perrito2.webp", "Golden recién bañado y secado"],
  ["perrito3.webp", "Bulldog francés, terminación prolija"],
  ["perrito5.webp", "Yorkshire con corte de cara"],
  ["perrito7.webp", "Turno de baño y cepillado"],
  ["perrito9.webp", "Después del deslanado"],
  ["perrito12.webp", "Corte de uñas y limpieza de oídos"],
  ["perrito4.webp", "Terminación de pelo corto"],
  ["perrito6.webp", "Corte parejo y prolijo"],
  ["perrito8.webp", "Listo después del turno"],
  ["perrito10.webp", "Pelo prolijo de cuerpo entero"],
  ["perrito11.webp", "Caniche con corte de cara"],
  ["perrito13.webp", "Baño y secado completo"],
  ["perrito14.webp", "Descansando después del baño"],
  ["perrito15.webp", "Corte de cara y orejas"],
  ["perrito16.webp", "Contento después de su turno"],
];

const dir = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dir || !url || !key) {
  console.error(
    "Uso: seed-gallery.ts <carpeta> (con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno)",
  );
  process.exit(1);
}
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
if (!isLocal && !process.argv.includes("--remote")) {
  console.error(
    "Esto apunta a un Supabase remoto. Repetilo con --remote si es lo que querés.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { count, error: countError } = await supabase
  .from("gallery_photos")
  .select("id", { count: "exact", head: true });
if (countError) throw countError;
if ((count ?? 0) > 0) {
  console.log(`La galería ya tiene ${count} fotos: no se hace nada.`);
  process.exit(0);
}

const now = Date.now();
for (const [index, [file, caption]] of PHOTOS.entries()) {
  const bytes = new Uint8Array(readFileSync(join(dir, file)));
  const size = readImageSize(bytes);
  if (!size) throw new Error(`${file}: no es una imagen válida`);

  const path = `g/${crypto.randomUUID()}.webp`;
  const { error: uploadError } = await supabase.storage
    .from("gallery")
    .upload(path, bytes, { contentType: "image/webp" });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("gallery_photos").insert({
    storage_path: path,
    caption,
    width: size.width,
    height: size.height,
    // The first photo of the list is the newest.
    created_at: new Date(now - index * 1000).toISOString(),
  });
  if (insertError) {
    await supabase.storage.from("gallery").remove([path]);
    throw insertError;
  }
  console.log(
    `${index + 1}/${PHOTOS.length} ${file} (${size.width}x${size.height})`,
  );
}
console.log("Listo.");
