"use client";

import { useEffect, useState } from "react";

/**
 * 2px electric-blue progress bar pinned to the top of the viewport
 * that fills as the user scrolls down the document. Pure transform
 * for animation — no layout work per scroll event.
 */
export function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const update = () => {
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) {
        setPct(0);
        return;
      }
      const next = Math.max(
        0,
        Math.min(1, window.scrollY / scrollable)
      );
      setPct(next);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Page scroll progress"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 60,
        pointerEvents: "none",
        background: "transparent",
      }}
    >
      <div
        style={{
          height: "100%",
          width: "100%",
          background:
            "linear-gradient(90deg, #3b82f6 0%, #60a5fa 50%, #22d3ee 100%)",
          transform: `scaleX(${pct})`,
          transformOrigin: "left center",
          willChange: "transform",
          boxShadow:
            pct > 0
              ? "0 0 8px rgba(59, 130, 246, 0.6), 0 0 2px rgba(59, 130, 246, 1)"
              : "none",
        }}
      />
    </div>
  );
}
