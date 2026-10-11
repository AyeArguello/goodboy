"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as m from "motion/react-m";
import { useInView } from "motion/react";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Soft entrance for content below the fold. The server renders it fully
 * visible, so nothing is hidden if scripts fail and nothing flashes at load:
 * only blocks that start off-screen are tucked away (before the first paint)
 * and released as they scroll into view. Blocks already on screen never move.
 *
 * `delay` lets a list stagger its items; keep the total under ~0.4 s.
 */
export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [belowFold, setBelowFold] = useState(false);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setBelowFold(
      element.getBoundingClientRect().top > window.innerHeight * 0.9,
    );
  }, []);

  const hidden = belowFold && !inView;

  return (
    <m.div
      ref={ref}
      className={className}
      initial={false}
      animate={hidden ? { opacity: 0, y } : { opacity: 1, y: 0 }}
      transition={
        hidden
          ? { duration: 0 }
          : { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }
      }
    >
      {children}
    </m.div>
  );
}
