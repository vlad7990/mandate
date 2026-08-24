import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/observability/scrub";

/**
 * Client-side Sentry init (NEXT-sentry D1/D4/D6).
 *
 * Same doctrine as the server file, same scrub module: errors only,
 * production only, DSN-absent no-ops (D2), no PII (D4), and no
 * replay — replay screenshots candidate data by design and stays
 * off (D6).
 *
 * ## Why the gate is NODE_ENV and not NEXT_PUBLIC_VERCEL_ENV
 *
 * `NEXT_PUBLIC_VERCEL_ENV` reaches the browser only when the
 * project's "automatically expose system environment variables"
 * setting is on. Gating solely on it would mean that if that setting
 * were ever off, browser capture would silently do nothing while
 * server capture kept working — a half-blind monitor that looks
 * healthy, which is precisely the failure this slice exists to end.
 * `NODE_ENV` is inlined by the bundler at build time and is always
 * "development" under `next dev`, so the local DSN in `.env.local`
 * cannot start shipping events from a laptop.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;

Sentry.init({
  dsn,
  enabled:
    Boolean(dsn) &&
    process.env.NODE_ENV === "production" &&
    vercelEnv !== "preview",
  environment: vercelEnv ?? process.env.NODE_ENV,

  // Errors only (D6).
  tracesSampleRate: 0,

  // The PII boundary (D4).
  sendDefaultPii: false,
  maxBreadcrumbs: 30,
  beforeBreadcrumb: scrubBreadcrumb,
  beforeSend: scrubEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
