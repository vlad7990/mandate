"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root error boundary (NEXT-sentry D3) — the layer below
 * `(dashboard)/error.tsx`. An error thrown in the root layout used to
 * show Next's unstyled page and record NOTHING anywhere; now it is
 * captured and the reader gets a page in the product's voice.
 *
 * A global-error replaces the root layout entirely, so it must render
 * its own <html>/<body> and cannot rely on the app shell, fonts, or
 * the icon set — plain elements and the palette's raw values only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("[global] root error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0a0c10",
          color: "#e6e8ec",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "96px 32px" }}>
          <p
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              fontSize: 11,
              color: "#f87171",
              borderTop: "1px solid #f87171",
              display: "inline-block",
              paddingTop: 8,
            }}
          >
            Something broke
          </p>
          <h1 style={{ fontSize: 28, lineHeight: 1.2, margin: "16px 0" }}>
            Mandate didn&apos;t load
          </h1>
          <p style={{ color: "#9aa1ab", lineHeight: 1.6 }}>
            The error was on our side, not yours. Retrying reloads the
            application.
          </p>
          <p
            style={{
              margin: "24px 0",
              padding: "12px 16px",
              border: "1px solid #2a2f38",
              fontSize: 12,
              color: "#9aa1ab",
              wordBreak: "break-all",
            }}
          >
            Reference: {error.digest ?? "no-digest"}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "transparent",
              border: "1px solid #60a5fa",
              color: "#60a5fa",
              padding: "10px 20px",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
