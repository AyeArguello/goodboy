"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import * as m from "motion/react-m";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { AnimatedLogo } from "./AnimatedLogo";
import { PawIcon } from "./PawIcon";

const SEEN_KEY = "gb-intro";
/** Long enough to read the line below the logo, short enough to never be a wait. */
const MIN_VISIBLE_MS = 1500;
/** The overlay never outlives this, even if the page is still loading. */
const MAX_VISIBLE_MS = 3800;
const LINE = "Peluquería canina";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First-visit intro: the animated logo with the business line underneath.
 *
 * It is server-rendered as part of the page so there is no flash of content
 * before it, and it cannot trap anyone: a click, a tap, Enter or Escape closes
 * it, it closes itself once the page has loaded (at least 1.5 s, at most 3.8
 * s), and the CSS fail-safe in globals.css hides it even if scripts never
 * run. It is shown once per browser session, never again on later visits to
 * the home page within it.
 */
export function IntroLoader() {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(true);

  const close = useCallback(() => {
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Private mode: the intro simply plays again next time.
    }
    setOpen(false);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (alreadySeen()) setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const minimum = new Promise<void>((resolve) =>
      window.setTimeout(resolve, MIN_VISIBLE_MS),
    );
    const loaded = new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve(), { once: true });
    });
    let cancelled = false;
    void Promise.all([minimum, loaded]).then(() => {
      if (!cancelled) close();
    });
    const ceiling = window.setTimeout(close, MAX_VISIBLE_MS);

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") close();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      window.clearTimeout(ceiling);
      window.removeEventListener("keydown", onKey);
      root.style.overflow = previousOverflow;
    };
  }, [open, close]);

  const onOverlayKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") close();
  };

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <m.div
          key="intro"
          role="status"
          aria-label="Cargando Good Boy, peluquería canina"
          tabIndex={-1}
          onClick={close}
          onKeyDown={onOverlayKey}
          className="intro-loader fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-5 bg-white px-6"
          exit={
            reduced
              ? { opacity: 0, transition: { duration: 0.25 } }
              : {
                  clipPath: "circle(0% at 50% 40%)",
                  transition: { duration: 0.6, ease: [0.65, 0, 0.35, 1] },
                }
          }
        >
          <AnimatedLogo size="min(62vw, 280px)" />

          <div className="flex flex-col items-center gap-1.5 text-center">
            <p className="font-heading text-charcoal m-0 text-[clamp(22px,5.5vw,30px)] leading-tight font-bold tracking-tight">
              <span className="sr-only">{LINE}</span>
              <span aria-hidden="true">
                {LINE.split("").map((letter, index) => (
                  <span
                    key={index}
                    className="intro-letter"
                    style={{ "--i": index } as CSSProperties}
                  >
                    {letter}
                  </span>
                ))}
              </span>
            </p>
            <p className="intro-fade text-ink-soft m-0 text-[clamp(15px,3.8vw,18px)]">
              Baño, secado y corte
            </p>
          </div>

          <div
            aria-hidden="true"
            className="text-lavender mt-1 flex items-center gap-3"
          >
            {[0, 1, 2, 3].map((paw) => (
              <span
                key={paw}
                className="intro-paw"
                style={{ "--i": paw } as CSSProperties}
              >
                <PawIcon
                  className="size-5 sm:size-6"
                  style={{ transform: `rotate(${paw % 2 ? 12 : -12}deg)` }}
                />
              </span>
            ))}
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
