"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { getPublicEnv } from "@/lib/env/public";
import { compressImage } from "@/lib/images/compress";
import {
  GALLERY_BUCKET,
  MAX_GALLERY_CAPTION,
  MAX_GALLERY_PHOTOS,
  galleryAltText,
  type GalleryPhoto,
} from "@/lib/domain/gallery";
import {
  deleteGalleryPhoto,
  prepareGalleryUpload,
  registerGalleryPhoto,
} from "@/app/admin/(app)/galeria/actions";

const ACCEPT = "image/jpeg,image/png,image/webp";

export function GalleryManager({ photos }: { photos: GalleryPhoto[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const full = photos.length >= MAX_GALLERY_PHOTOS;
  const remaining = MAX_GALLERY_PHOTOS - photos.length;

  async function upload() {
    if (!file || full) return;
    setFeedback(null);
    setUploading(true);
    try {
      const { blob, extension } = await compressImage(file);

      const prepared = await prepareGalleryUpload(extension);
      if (!prepared.ok) {
        setFeedback({ kind: "error", text: prepared.error });
        return;
      }

      const env = getPublicEnv();
      const storage = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { auth: { persistSession: false } },
      ).storage.from(GALLERY_BUCKET);
      const { error } = await storage.uploadToSignedUrl(
        prepared.path,
        prepared.token,
        blob,
        { contentType: blob.type },
      );
      if (error) {
        setFeedback({
          kind: "error",
          text: "No se pudo subir la foto. Revisá tu conexión y probá de nuevo.",
        });
        return;
      }

      const registered = await registerGalleryPhoto(prepared.path, caption);
      if (!registered.ok) {
        setFeedback({ kind: "error", text: registered.error });
        return;
      }

      setFeedback({ kind: "ok", text: "Foto agregada a la galería." });
      setFile(null);
      setCaption("");
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch {
      setFeedback({
        kind: "error",
        text: "No pudimos leer esa foto. Probá con otra imagen (JPG, PNG o WebP).",
      });
    } finally {
      setUploading(false);
    }
  }

  function remove(photo: GalleryPhoto) {
    setConfirmingId(null);
    startTransition(async () => {
      const result = await deleteGalleryPhoto(photo.id);
      setFeedback(
        result.ok
          ? { kind: "ok", text: "Foto quitada de la galería." }
          : { kind: "error", text: result.error },
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="border-lavender-100 flex flex-col gap-3 rounded-xl border bg-white p-4.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading m-0 text-base font-bold">Agregar foto</h2>
          <span
            className={`font-heading rounded-full border-[1.5px] px-3 py-1 text-sm font-bold ${
              full
                ? "border-error bg-error-bg text-error"
                : "border-lavender text-charcoal"
            }`}
          >
            {photos.length} de {MAX_GALLERY_PHOTOS} fotos
          </span>
        </div>

        {full ? (
          <Alert variant="warning" title="La galería está completa">
            Hay {MAX_GALLERY_PHOTOS} fotos, que es el máximo. Quitá alguna para
            poder subir otra.
          </Alert>
        ) : (
          <>
            <p className="text-ink-soft m-0 text-sm">
              Podés subir{" "}
              {remaining === 1 ? "1 foto más" : `${remaining} fotos más`}. Se
              achican solas antes de subirse, así que sirve la foto del celular
              tal cual.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="font-heading text-[15px] font-semibold">
                Foto
              </span>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                disabled={uploading}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="border-ink-soft file:bg-lavender-100 file:text-charcoal file:font-heading min-h-13 w-full rounded-md border-[1.5px] bg-white p-2 text-base file:mr-3 file:rounded-full file:border-0 file:px-4 file:py-2.5 file:font-semibold"
              />
            </label>
            <TextField
              label="Descripción"
              optional
              hint="Se usa como texto alternativo, por ejemplo: Golden recién bañado."
              maxLength={MAX_GALLERY_CAPTION}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={uploading}
            />
            <Button
              onClick={upload}
              loading={uploading}
              loadingText="Subiendo…"
              disabled={!file}
            >
              Subir a la galería
            </Button>
          </>
        )}

        <div aria-live="polite">
          {feedback ? (
            <Alert variant={feedback.kind === "error" ? "error" : "info"}>
              {feedback.text}
            </Alert>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading m-0 text-base font-bold">
          Fotos de la galería
        </h2>
        {photos.length === 0 ? (
          <p className="border-lavender text-ink-soft m-0 rounded-lg border-[1.5px] border-dashed p-5">
            Todavía no hay fotos. Agregá la primera arriba.
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
            {photos.map((photo) => (
              <li
                key={photo.id}
                className="border-lavender-100 flex flex-col overflow-hidden rounded-lg border-[1.5px] bg-white"
              >
                <div className="bg-lavender-100 relative aspect-square">
                  <Image
                    src={photo.url}
                    alt={galleryAltText(photo.caption)}
                    fill
                    unoptimized
                    sizes="(min-width: 640px) 33vw, 50vw"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2.5">
                  <span className="text-ink-soft line-clamp-2 min-h-10 text-sm">
                    {photo.caption || "Sin descripción"}
                  </span>
                  {confirmingId === photo.id ? (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-error m-0 text-sm font-bold">
                        ¿Quitar esta foto?
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-error! hover:bg-error!"
                          onClick={() => remove(photo)}
                          loading={isPending}
                        >
                          Sí, quitar
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setConfirmingId(null)}
                        >
                          No
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmingId(photo.id)}
                      aria-label={`Quitar foto: ${galleryAltText(photo.caption)}`}
                    >
                      Quitar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
