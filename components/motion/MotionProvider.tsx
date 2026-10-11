"use client";

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

/**
 * Loads Motion's lightweight DOM feature set once for the landing page and
 * turns transform animations off for visitors who ask for reduced motion
 * (opacity and color changes stay, so state is still communicated). Every
 * animated element under it uses the tiny `m` component from
 * `motion/react-m`; `strict` makes a stray full `motion` import fail loudly
 * instead of silently adding ~30 kB.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
