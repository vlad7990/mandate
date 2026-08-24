import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { captureSeamError } from "@/lib/observability/sentry";

/**
 * TEMPORARY — NEXT-sentry Phase 3's server-side proof. This file is
 * DELETED at the end of the phase, together with its env token; if
 * you are reading it on main, that deletion was missed.
 *
 * Fails closed exactly like /api/cron/maintenance: no token in the
 * environment means 503, and a mismatched token means 404 — a probe
 * endpoint that defaults to open would let anyone write to our
 * telemetry budget.
 *
 * It reports the event AS SENT — after `beforeSend` — so the D4
 * boundary is proven on the server's own bytes rather than assumed
 * from the client's.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.SENTRY_PROBE_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "probe disabled" }, { status: 503 });
  }
  const token = new URL(request.url).searchParams.get("token");
  if (token !== expected) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const client = Sentry.getClient();
  if (!client) {
    return NextResponse.json({
      ok: false,
      reason: "no Sentry client on the server — init did not run or the DSN is absent",
    });
  }

  const options = client.getOptions();
  const sent: unknown[] = [];
  const off = client.on("afterSendEvent", (event, response) => {
    const values = event.exception?.values ?? [];
    sent.push({
      status: (response as { statusCode?: number } | undefined)?.statusCode,
      eventId: event.event_id,
      message: values[0]?.value ?? event.message,
      tags: event.tags,
      environment: event.environment,
      hasUser: Boolean(event.user),
      hasRequestData: Boolean(event.request?.data),
      hasCookies: Boolean(event.request?.cookies),
      hasHeaders: Boolean(event.request?.headers),
    });
  });

  // The exact leak shape: a provider payload quoting the serialised
  // model input — candidate identities, CV text, hiring-manager words.
  const payload = JSON.stringify({
    candidates: [
      { full_name: "Perl Ashwood", cv: "Twenty years leading platform engineering", current_company: "Nortel Peak" },
      { full_name: "Holt Verner", cv: "Scaled a 40-person org", current_company: "Gridwise" },
    ],
    feedback: [{ content: "the hiring manager thinks she is too regulatory" }],
  });

  captureSeamError(
    "[search-health] PROBE-087 server fault",
    new Error(`400 {"type":"error","error":{"message":"invalid schema for input ${payload}"}}`)
  );

  const flushed = await Sentry.flush(8000);
  off();

  return NextResponse.json({
    ok: true,
    clientPresent: true,
    enabled: options.enabled,
    dsnPresent: Boolean(options.dsn),
    environment: options.environment,
    tracesSampleRate: options.tracesSampleRate,
    sendDefaultPii: options.sendDefaultPii,
    flushed,
    sent,
  });
}
