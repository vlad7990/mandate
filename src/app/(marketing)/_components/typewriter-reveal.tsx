"use client";

import { useEffect, useState } from "react";

/**
 * Typewriter that types `text` character-by-character once the
 * configured delay elapses, then keeps a blinking ▌ cursor visible
 * for `cursorDuration` ms before the cursor itself disappears.
 *
 * Reduced-motion: snaps straight to the full text, no cursor.
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
  const [visible, setVisible] = useState(0);
  type Phase = "hidden" | "typing" | "cursor" | "done";
  const [phase, setPhase] = useState<Phase>("hidden");
  const [reduced, setReduced] = useState(false);

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
      <span aria-label={text}>{text.slice(0, visible)}</span>
      {(phase === "typing" || phase === "cursor") && (
        <span className="m-typewriter-cursor" aria-hidden>
          ▌
        </span>
      )}
    </span>
  );
}
