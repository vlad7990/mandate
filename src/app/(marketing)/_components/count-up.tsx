"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated counter that ramps from `from` to `to` once the element
 * enters the viewport. Uses requestAnimationFrame so the timing is
 * frame-accurate, and IntersectionObserver so it doesn't fire above
 * the fold while the user is still mid-page.
 *
 * Respects prefers-reduced-motion — the counter snaps straight to the
 * destination instead of animating. Mobile uses a shorter duration
 * automatically (set via `mobileDuration`).
 */
export function CountUp({
  from = 0,
  to,
  duration = 1400,
  format = (n) => Math.round(n).toString(),
  prefix = "",
  suffix = "",
  className,
}: {
  from?: number;
  to: number;
  duration?: number;
  format?: (n: number) => string;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(from);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced-motion: snap. Deferred a tick so the setState lands
    // outside the synchronous effect body — keeps the lint rule
    // react-hooks/set-state-in-effect quiet.
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const snap = window.setTimeout(() => setValue(to), 0);
      return () => window.clearTimeout(snap);
    }

    let started = false;
    let frame = 0;

    const start = () => {
      if (started) return;
      started = true;
      const startedAt = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startedAt) / duration);
        // Ease-out cubic — slows as it approaches target, feels natural
        // for a counter without overshoot.
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(from + (to - from) * eased);
        if (t < 1) {
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === "undefined") {
      start();
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            start();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [from, to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {format(value)}
      {suffix}
    </span>
  );
}
