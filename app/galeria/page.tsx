import type { Metadata } from "next";
import { GalleryWall } from "@/components/gallery/GalleryWall";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { CtaLink } from "@/components/ui/Link";
import { getGalleryPhotos } from "@/lib/data/gallery";

export const metadata: Metadata = {
  title: "Galería",
  description:
    "Perros que pasaron por Good Boy: baño, secado y corte en Córdoba capital.",
};

// Admin changes revalidate this page; the timer is only a safety net.
export const revalidate = 60;

export default async function GaleriaPage() {
  const photos = await getGalleryPhotos();

  return (
    <MotionProvider>
      <Header anchorBase="/" />
      <main className="bg-canvas">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 sm:px-8 md:py-16">
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="font-heading text-purple m-0 text-sm font-semibold tracking-[0.14em] uppercase">
              Galería
            </p>
            <h1 className="font-heading text-charcoal m-0 text-[clamp(30px,4vw,48px)] leading-tight font-bold tracking-tight">
              Perros que pasaron por Good Boy
            </h1>
            <p className="text-ink-soft m-0 text-lg">
              Algunos de los perros que ya pasaron por Good Boy. Tocá una foto
              para verla completa.
            </p>
          </div>

          {photos.length === 0 ? (
            <p className="border-lavender text-ink-soft m-0 rounded-lg border-[1.5px] border-dashed p-6">
              Pronto vamos a subir las primeras fotos.
            </p>
          ) : (
            <GalleryWall photos={photos} />
          )}

          <div className="flex flex-col items-center gap-3 pt-4 text-center">
            <p className="font-heading text-charcoal m-0 text-xl font-bold">
              ¿Querés que el próximo sea el tuyo?
            </p>
            <CtaLink href="/turnos">Solicitar turno</CtaLink>
          </div>
        </div>
      </main>
      <Footer />
    </MotionProvider>
  );
}
