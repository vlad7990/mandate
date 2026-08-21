import * as Sentry from "@sentry/nextjs";

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
 * Errors only, production only, no request bodies, no cookies, no
 * emails. Provider error messages are length-capped in `beforeSend`
 * because a provider payload can embed the model input, and the
 * model input embeds candidate data — `safeFailureMessage`'s
 * paranoia, applied at the telemetry door. The only identity an
 * event may carry is the users-row uuid (the trail's own actor
 * shape), and nothing sets one today.
 */

const PROVIDER_MESSAGE_CAP = 500;

export function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
    enabled: process.env.VERCEL_ENV === "production",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

    // Errors only (D6): no APM, no tracing, nothing sampled.
    tracesSampleRate: 0,

    // The PII boundary (D4).
    sendDefaultPii: false,
    maxBreadcrumbs: 30,
    beforeBreadcrumb(breadcrumb) {
      // Navigation and console categories only — and console lines
      // capped, because our own seam logs pass provider payloads.
      if (breadcrumb.category !== "navigation" && breadcrumb.category !== "console") {
        return null;
      }
      if (typeof breadcrumb.message === "string") {
        breadcrumb.message = breadcrumb.message.slice(0, 200);
      }
      delete breadcrumb.data;
      return breadcrumb;
    },
    beforeSend(event) {
      // Never a body, never a cookie, never a header set (D4).
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
      }
      delete event.user;
      // Provider messages can embed the model input; cap every
      // exception value at the same threshold the reader-facing
      // backstop uses.
      for (const ex of event.exception?.values ?? []) {
        if (typeof ex.value === "string" && ex.value.length > PROVIDER_MESSAGE_CAP) {
          ex.value = `${ex.value.slice(0, PROVIDER_MESSAGE_CAP)}… [capped at ${PROVIDER_MESSAGE_CAP}]`;
        }
      }
      return event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
