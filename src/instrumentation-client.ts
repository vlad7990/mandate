import * as Sentry from "@sentry/nextjs";

/**
 * Client-side Sentry init (NEXT-sentry D1/D4/D6). Deliberately a
 * sibling of the server init rather than an import from it — the
 * client bundle carries only what it needs, and the scrub rules are
 * short enough to state twice.
 *
 * Same doctrine as the server file: errors only, production only,
 * DSN-absent no-ops (D2), no PII (D4), no replay — replay
 * screenshots candidate data by design and stays off (D6).
 */

const PROVIDER_MESSAGE_CAP = 500;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NEXT_PUBLIC_VERCEL_ENV === "production",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

  // Errors only (D6).
  tracesSampleRate: 0,

  // The PII boundary (D4).
  sendDefaultPii: false,
  maxBreadcrumbs: 30,
  beforeBreadcrumb(breadcrumb) {
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
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.headers;
    }
    delete event.user;
    for (const ex of event.exception?.values ?? []) {
      if (typeof ex.value === "string" && ex.value.length > PROVIDER_MESSAGE_CAP) {
        ex.value = `${ex.value.slice(0, PROVIDER_MESSAGE_CAP)}… [capped at ${PROVIDER_MESSAGE_CAP}]`;
      }
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
