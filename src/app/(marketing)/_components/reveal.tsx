"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal-on-scroll wrapper. Uses IntersectionObserver to add
 * `is-visible` to children once they enter the viewport. Children
 * styled via .m-reveal or .m-reveal-stagger inherit transitions from
 * marketing.css. Once revealed, the observer disconnects — we don't
 * need to track exit transitions on a marketing page.
 *
 * IMPORTANT for the stagger variants: `.m-reveal-stagger > *` targets
 * DIRECT children, so this component must BE the list, not wrap one.
 * `<Reveal as="ul"><ul>…</ul></Reveal>` produces invalid `ul > ul` AND
 * gives the stagger exactly one child, so the per-item delays never
 * fire. Pass the list's own class to Reveal and give it the <li>s
 * directly.
 */
export function Reveal({
  children,
  className = "",
  threshold = 0.15,
  as: Tag = "div",
  style,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
  as?: keyof React.JSX.IntrinsicElements;
  /** Forwarded so a list that IS the reveal target keeps its name. */
  "aria-label"?: string;
  /** Layout styles for the revealed element itself. Needed so a grid
   *  can live ON the stagger wrapper instead of on a child, which would
   *  leave the stagger with a single target. */
  style?: React.CSSProperties;
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

  // A dynamic tag, so `as` genuinely reaches the DOM for ANY element.
  // The previous hand-written branch chain handled div/section/ul and
  // fell through to a div for everything else — so `as="ol"` was
  // silently ignored and rendered a div, with no error to notice.
  //
  // The cast narrows the intrinsic element for TypeScript's benefit
  // only; the real tag is whatever `as` names at runtime.
  const Element = Tag as "div";

  return (
    <Element
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`${className}${visible ? " is-visible" : ""}`}
      style={style}
      aria-label={ariaLabel}
    >
      {children}
    </Element>
  );
}
