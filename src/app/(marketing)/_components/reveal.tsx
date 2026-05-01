"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal-on-scroll wrapper. Uses IntersectionObserver to add
 * `is-visible` to children once they enter the viewport. Children
 * styled via .m-reveal or .m-reveal-stagger inherit transitions from
 * marketing.css. Once revealed, the observer disconnects — we don't
 * need to track exit transitions on a marketing page.
 */
export function Reveal({
  children,
  className = "",
  threshold = 0.15,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
  as?: keyof React.JSX.IntrinsicElements;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // Fallback for environments without IntersectionObserver (very
      // old browsers / some test runners): defer the reveal one tick
      // to keep the state mutation out of the synchronous effect body.
      const t = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(t);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  // Use createElement so we can pass `as` through cleanly to any tag.
  return Tag === "div" ? (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`${className} ${visible ? "is-visible" : ""}`}
    >
      {children}
    </div>
  ) : Tag === "section" ? (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className={`${className} ${visible ? "is-visible" : ""}`}
    >
      {children}
    </section>
  ) : Tag === "ul" ? (
    <ul
      ref={ref as React.RefObject<HTMLUListElement>}
      className={`${className} ${visible ? "is-visible" : ""}`}
    >
      {children}
    </ul>
  ) : (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`${className} ${visible ? "is-visible" : ""}`}
    >
      {children}
    </div>
  );
}
