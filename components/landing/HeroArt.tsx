"use client";

import { useRef, type CSSProperties, type PointerEvent } from "react";
import Image from "next/image";
import * as m from "motion/react-m";
import {
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { PawIcon } from "./PawIcon";

/**
 * The hero picture and the little characters around it: a sticker badge, soap
 * bubbles and paw prints that drift while the hero is on screen, and a photo
 * that leans toward the pointer on devices that have one. Everything around
 * the photo is decoration (hidden from assistive technology) and the photo
 * keeps its place in the layout on every screen size.
 */
export function HeroArt() {
  const stage = useRef<HTMLDivElement>(null);
  const onScreen = useInView(stage);
  const reduced = useReducedMotion();

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const spring = { stiffness: 140, damping: 16, mass: 0.6 };
  const rotateY = useSpring(
    useTransform(pointerX, [-0.5, 0.5], [-5, 5]),
    spring,
  );
  const rotateX = useSpring(
    useTransform(pointerY, [-0.5, 0.5], [4, -4]),
    spring,
  );

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (reduced || event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - box.left) / box.width - 0.5);
    pointerY.set((event.clientY - box.top) / box.height - 0.5);
  }
  function onPointerLeave() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <div
      ref={stage}
      data-paused={onScreen ? "false" : "true"}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="hero-art relative mx-auto w-full max-w-[460px] md:max-w-none"
    >
      {/* Offset lavender arch behind the photo (the outer box places it, the inner one animates). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-3 translate-y-3 rotate-[3deg] sm:translate-x-4 sm:translate-y-4"
      >
        <div className="hero-photo bg-lavender size-full rounded-[clamp(120px,18vw,260px)_clamp(120px,18vw,260px)_28px_28px]" />
      </div>

      <m.div
        style={{
          rotateX,
          rotateY,
          transformPerspective: 1000,
        }}
        className="relative aspect-4/5 max-h-[640px] w-full"
      >
        <div className="hero-photo border-charcoal relative size-full overflow-hidden rounded-[clamp(120px,18vw,260px)_clamp(120px,18vw,260px)_28px_28px] border-[1.5px] bg-white">
          <Image
            src="/images/perros/perrito1.webp"
            alt="Perro recién bañado y peinado en Good Boy"
            fill
            priority
            sizes="(min-width: 768px) 46vw, (min-width: 480px) 460px, 100vw"
            className="object-cover"
          />
        </div>
      </m.div>

      {/* Sticker: a round badge that wobbles when touched. */}
      <m.div
        aria-hidden="true"
        className="absolute -top-3 -left-2 z-10 sm:-top-4 sm:-left-5"
        style={{ rotate: -10 }}
        whileHover={reduced ? undefined : { rotate: 6, scale: 1.08 }}
        whileTap={reduced ? undefined : { scale: 0.94 }}
        transition={{ type: "spring", stiffness: 320, damping: 12 }}
      >
        <div
          className="hero-pop bg-purple flex size-[104px] flex-col items-center justify-center gap-0.5 rounded-full text-white shadow-[0_12px_24px_-8px_rgb(86_63_102/0.5)] sm:size-[124px]"
          style={{ "--hero-delay": "700ms" } as CSSProperties}
        >
          <PawIcon className="size-6 sm:size-7" />
          <span className="font-heading text-[15px] leading-none font-bold sm:text-[17px]">
            Sin apuro
          </span>
        </div>
      </m.div>

      {/* Chip over the lower edge of the photo. */}
      <div
        aria-hidden="true"
        className="hero-in border-charcoal font-heading absolute -bottom-3 left-3 z-10 flex items-center gap-2 rounded-full border-[1.5px] bg-white px-4 py-2 text-sm font-semibold sm:-bottom-4 sm:left-6"
        style={{ "--hero-delay": "900ms" } as CSSProperties}
      >
        <span className="bg-purple size-2.5 rounded-full" />
        Con turno previo
      </div>

      {/* Soap bubbles and paws drifting around the photo. */}
      <span
        aria-hidden="true"
        className="float-slow border-purple/60 absolute top-[14%] -right-2 size-7 rounded-full border-[2.5px] bg-white/80 sm:-right-6 sm:size-9"
      />
      <span
        aria-hidden="true"
        className="float-slower border-lavender absolute top-[34%] -right-3 size-4 rounded-full border-2 sm:-right-9"
      />
      <span
        aria-hidden="true"
        className="float-slower border-purple/50 absolute bottom-[22%] -left-3 size-5 rounded-full border-2 sm:-left-8 sm:size-6"
      />
      <span
        aria-hidden="true"
        className="absolute right-4 -bottom-7 rotate-[18deg] sm:right-2 sm:-bottom-9"
      >
        <PawIcon className="float-slow text-purple/70 size-10 sm:size-12" />
      </span>
      <span
        aria-hidden="true"
        className="absolute right-[26%] -bottom-12 hidden -rotate-[14deg] sm:block"
      >
        <PawIcon className="float-slower text-purple/50 size-7" />
      </span>
    </div>
  );
}
