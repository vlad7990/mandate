import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

// The delivery webhook (099, spec §5.1): Resend's svix-signed events
// update delivery_status and suppress bounced/complained addresses —
// through `record_email_delivery_event`, which is inert without a
// provider-named row. The signature is verified HERE, before the
// database hears anything; without RESEND_WEBHOOK_SECRET the route
// answers 503 and touches nothing (ships dormant until the founder
// wires the Resend dashboard).
//
// Svix scheme: signature = base64(HMAC-SHA256(secret, "{id}.{timestamp}.{payload}"))
// with the secret being the base64 payload of the "whsec_..." key;
// the header carries space-separated "v1,<sig>" entries.

const TOLERANCE_SECONDS = 5 * 60;

function verifySvix(
  secret: string,
  id: string,
  timestamp: string,
  payload: string,
  signatureHeader: string
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest();

  for (const entry of signatureHeader.split(" ")) {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) continue;
    let candidate: Buffer;
    try {
      candidate = Buffer.from(sig, "base64");
    } catch {
      continue;
    }
    if (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    ) {
      return true;
    }
  }
  return false;
}

const STATUS_BY_EVENT: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("webhook not configured", { status: 503 });
  }

  const payload = await request.text();
  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !signature) {
    return new Response("missing signature", { status: 400 });
  }
  if (!verifySvix(secret, id, timestamp, payload, signature)) {
    return new Response("bad signature", { status: 401 });
  }

  let event: {
    type?: string;
    data?: { email_id?: string; to?: string[] | string };
  };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  const status = STATUS_BY_EVENT[event.type ?? ""];
  const messageId = event.data?.email_id;
  if (!status || !messageId) {
    // Not this record's business — acknowledged so the provider
    // stops retrying.
    return new Response("ignored", { status: 200 });
  }
  const to = Array.isArray(event.data?.to)
    ? event.data?.to?.[0]
    : event.data?.to;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return new Response("storage not configured", { status: 503 });
  }
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc("record_email_delivery_event", {
    p_provider_message_id: messageId,
    p_status: status,
    p_address: to ?? null,
    p_detail: event.type ?? null,
  });
  if (error) {
    // 500 so the provider retries — the row exists and the write is
    // idempotent.
    return new Response("recording failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
