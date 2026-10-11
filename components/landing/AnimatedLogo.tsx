"use client";

import Image from "next/image";
import * as m from "motion/react-m";
import { useReducedMotion } from "motion/react";
import { businessConfig } from "@/lib/config/business";

/*
 * Positions are in the logo's own 1254 x 1254 pixel grid, so the animated
 * layer sits exactly on the artwork at any rendered size: the shower head is
 * near (520, 215), the dog's nose near (560, 350) and the rim of the tub runs
 * along y = 600.
 */
const DROPS = [
  { x: 498, delay: 0 },
  { x: 536, delay: 0.22 },
  { x: 572, delay: 0.44 },
  { x: 604, delay: 0.1 },
];
const BUBBLES = [
  { x: 430, r: 18, delay: 0.1, rise: 150 },
  { x: 560, r: 24, delay: 0.7, rise: 190 },
  { x: 700, r: 16, delay: 0.35, rise: 160 },
  { x: 820, r: 22, delay: 1.0, rise: 180 },
  { x: 930, r: 17, delay: 0.55, rise: 150 },
];

/**
 * The logo, alive: it pops in (CSS, so it paints at once), the shower drips on the dog and soap bubbles
 * rise from the tub. The artwork stays the real logo file; only a thin layer
 * of drops and bubbles in the logo's own lavender is animated on top of it.
 * With reduced motion it is the plain, still logo.
 */
export function AnimatedLogo({ size }: { size: string }) {
  const reduced = useReducedMotion();

  return (
    <div className="intro-pop relative" style={{ width: size, height: size }}>
      <m.div
        className="absolute inset-0"
        animate={reduced ? undefined : { y: [0, -7, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Image
          src="/images/logo-good-boy.jpg"
          alt={businessConfig.name}
          fill
          priority
          sizes="(min-width: 640px) 280px, 62vw"
          className="object-contain mix-blend-multiply"
        />
        {reduced ? null : (
          <svg
            viewBox="0 0 1254 1254"
            className="pointer-events-none absolute inset-0 size-full"
            aria-hidden="true"
            focusable="false"
          >
            {DROPS.map((drop) => (
              <m.ellipse
                key={drop.x}
                cx={drop.x}
                cy={262}
                rx={7}
                ry={11}
                fill="#c4b2d8"
                initial={{ y: 0, opacity: 0 }}
                animate={{ y: [0, 120, 150], opacity: [0, 1, 0] }}
                transition={{
                  duration: 0.95,
                  delay: 0.5 + drop.delay,
                  repeat: Infinity,
                  repeatDelay: 0.35,
                  ease: "easeIn",
                }}
              />
            ))}
            {BUBBLES.map((bubble) => (
              <m.circle
                key={bubble.x}
                cx={bubble.x}
                cy={610}
                r={bubble.r}
                fill="white"
                stroke="#c4b2d8"
                strokeWidth={6}
                initial={{ y: 0, opacity: 0, scale: 0.6 }}
                animate={{
                  y: [0, -bubble.rise],
                  opacity: [0, 1, 1, 0],
                  scale: [0.6, 1, 1.12, 1.2],
                }}
                transition={{
                  duration: 2.6,
                  delay: 0.6 + bubble.delay,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            ))}
          </svg>
        )}
      </m.div>
    </div>
  );
}
