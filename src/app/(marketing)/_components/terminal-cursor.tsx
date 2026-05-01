"use client";

import { useEffect, useState } from "react";

/**
 * Blinking block cursor — appears next to a headline, blinks for ~2s,
 * then disappears. Used to reinforce the terminal motif at the top of
 * key sections. Pure CSS animation; the React layer just hides it
 * after the timeout fires.
 */
export function TerminalCursor({
  delay = 0,
  duration = 2200,
}: {
  /** Delay before the cursor mounts, in ms. */
  delay?: number;
  /** Duration the cursor stays visible after mount, in ms. */
  duration?: number;
}) {
  const [phase, setPhase] = useState<"hidden" | "visible">("hidden");

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // Reduced motion — skip the blinking flourish entirely.
      return;
    }
    const showTimer = window.setTimeout(() => setPhase("visible"), delay);
    const hideTimer = window.setTimeout(
      () => setPhase("hidden"),
      delay + duration
    );
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [delay, duration]);

  if (phase === "hidden") return null;

  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: "0.45em",
        height: "0.85em",
        marginLeft: "0.18em",
        verticalAlign: "baseline",
        background: "var(--accent)",
        animation: "term-cursor-blink 540ms steps(1, end) infinite",
        translate: "0 0.05em",
        boxShadow: "0 0 8px var(--accent-glow)",
      }}
    />
  );
}
