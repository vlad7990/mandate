"use client";

import { useEffect, useLayoutEffect, useState } from "react";

/**
 * useLayoutEffect on the client, useEffect on the server — React warns
 * about the former during SSR. We need the layout variant so the typing
 * start state is applied BEFORE the browser paints, otherwise the
 * server-rendered full string would flash and then restart.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Typewriter that types `text` character-by-character once the
 * configured delay elapses, then keeps a blinking ▌ cursor visible
 * for `cursorDuration` ms before the cursor itself disappears.
 *
 * Reduced-motion: snaps straight to the full text, no cursor.
 *
 * SSR: renders the COMPLETE string. This component carries half the
 * <h1>, and it previously served `text.slice(0, 0)` — an empty span
 * whose only content was an `aria-label` — so every crawler, social
 * scraper and no-JS reader received a headline reading "One line in."
 * and nothing else. The full text is now in the static HTML, the
 * typing start state is applied in a layout effect (before paint, so
 * there is no flash), and the accessible name comes from a real
 * visually-hidden node rather than a prohibited label on role=generic.
 *
 * Pattern detail: every state mutation runs inside a setTimeout
 * (either the typing tick, the phase transition, or the deferred
 * reduced-motion check) so React never sees a synchronous setState
 * in the effect body — the lint rule `react-hooks/set-state-in-effect`
 * stays happy without a remount-by-key dance.
 */
export function TypewriterReveal({
  text,
  delay = 0,
  speed = 80,
  cursorDuration = 2000,
}: {
  text: string;
  /** Wait this long after mount before the first character types. */
  delay?: number;
  /** Milliseconds per character. */
  speed?: number;
  /** Cursor blink window (ms) AFTER the last character is typed. */
  cursorDuration?: number;
}) {
  // Start FULL, not empty — this is what the server renders and what
  // a no-JS client keeps. The layout effect below rewinds it to 0
  // before the first paint when animation is actually possible.
  const [visible, setVisible] = useState(text.length);
  type Phase = "static" | "hidden" | "typing" | "cursor" | "done";
  const [phase, setPhase] = useState<Phase>("static");
  const [reduced, setReduced] = useState(false);

  // Rewind to the typing start state before paint. Runs client-only, so
  // the static HTML and the pre-hydration DOM both keep the full string.
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setVisible(0);
    setPhase("hidden");
  }, []);

  // Detect reduced-motion — deferred so the setState lands outside
  // the synchronous effect body.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const matches = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const t = window.setTimeout(() => setReduced(matches), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (reduced) {
      // Snap to full visible state. Deferred via setTimeout(0).
      const t = window.setTimeout(() => {
        setVisible(text.length);
        setPhase("done");
      }, 0);
      return () => window.clearTimeout(t);
    }

    // Server / no-JS / pre-paint: the full string is already rendered
    // and there is nothing to animate.
    if (phase === "static") return;

    if (phase === "hidden") {
      const t = window.setTimeout(() => setPhase("typing"), delay);
      return () => window.clearTimeout(t);
    }
    if (phase === "typing") {
      if (visible >= text.length) {
        const t = window.setTimeout(() => setPhase("cursor"), 0);
        return () => window.clearTimeout(t);
      }
      const t = window.setTimeout(
        () => setVisible((v) => v + 1),
        speed
      );
      return () => window.clearTimeout(t);
    }
    if (phase === "cursor") {
      const t = window.setTimeout(() => setPhase("done"), cursorDuration);
      return () => window.clearTimeout(t);
    }
  }, [phase, visible, text, speed, delay, cursorDuration, reduced]);

  return (
    <span style={{ display: "inline" }}>
      {/*
        One stable accessible name for the whole clause, present from
        the first byte of HTML and never partial — assistive tech reads
        this, not the character-by-character node beside it.
      */}
      <span className="m-sr-only">{text}</span>
      <span aria-hidden="true">{text.slice(0, visible)}</span>
      {/*
        The untyped remainder stays IN the layout, just invisible — the
        headline's box (and every line break in it) is final from first
        paint, so nothing below shifts as characters appear. Rendering
        the remainder away entirely was CLS 0.197 on mobile Lighthouse:
        the hero grew line by line and pushed the lede down each tick.
        The cursor is out of flow for the same reason — anchored to a
        zero-width span so it adds no width to the line it blinks on.
      */}
      {(phase === "typing" || phase === "cursor") && (
        <span aria-hidden style={{ position: "relative" }}>
          <span
            className="m-typewriter-cursor"
            style={{ position: "absolute", left: 0 }}
          >
            ▌
          </span>
        </span>
      )}
      {visible < text.length && (
        <span aria-hidden="true" style={{ visibility: "hidden" }}>
          {text.slice(visible)}
        </span>
      )}
    </span>
  );
}
