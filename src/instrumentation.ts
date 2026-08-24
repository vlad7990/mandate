import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/observability/scrub";

/**
 * Server-side Sentry init (NEXT-sentry D1/D4/D6) — plus
 * `onRequestError`, the hook that catches what `runAction` never
 * sees: server component renders, route handlers (the cron route,
 * the HM and portal token doors, /api/copilot, /api/demo), and the
 * fire-and-forget after() blocks whose only record used to be a
 * server log line.
 *
 * ## The kill switch (D2)
 *
 * No DSN → the SDK no-ops entirely. The env pair is the switch, the
 * same shape as every agent credential: unset it and telemetry is
 * off with zero code change.
 *
 * ## The PII boundary (D4)
 *
 * Errors only, production only, and every event through
 * `lib/observability/scrub` — the rules live there rather than
 * inline because they are the safety property this slice rests on,
 * and `scrub.test.ts` holds them to it.
 */

export function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  Sentry.init({
    dsn,
    // Same shape as the client gate: the DSN is the switch, NODE_ENV
    // keeps a laptop's .env.local silent, and previews never report.
    enabled:
      Boolean(dsn) &&
      process.env.NODE_ENV === "production" &&
      process.env.VERCEL_ENV !== "preview",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

    // Errors only (D6): no APM, no tracing, nothing sampled.
    tracesSampleRate: 0,

    // The PII boundary (D4).
    sendDefaultPii: false,
    maxBreadcrumbs: 30,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
}

export const onRequestError = Sentry.captureRequestError;
