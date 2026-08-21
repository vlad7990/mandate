import "server-only";
import { getAnthropic } from "@/lib/anthropic";

/**
 * The desk digest — the manager's Monday-morning read, one Anthropic call.
 *
 * Cost shape (persona plan, Phase 3): one call per digest, never one per
 * mandate. Depth per mandate already exists in the weekly report agent;
 * this agent's job is the cross-desk synthesis a manager would otherwise
 * assemble by hand from the rollup.
 *
 * Delivery honesty: there is no email channel until Resend exists. The
 * digest renders on the desk and says so — detection without a channel is
 * stated, not implied away (§14's cron reasoning).
 */

export const DESK_DIGEST_MODEL = "claude-sonnet-4-6";

export type DeskDigestInput = {
  organization_name: string;
  generated_for_week_of: string;
  members: Array<{
    name: string;
    role: string;
    active_mandates: Array<{
      title: string;
      company: string;
      status: string;
      candidate_count: number;
      health: string | null;
    }>;
    placements_total: number;
    placements_started: number;
    last_activity_at: string | null;
  }>;
  unassigned_mandates: Array<{ title: string; company: string }>;
};

export type DeskDigest = {
  headline: string;
  desk_reading: string;
  member_notes: Array<{ member: string; note: string }>;
  risks: string[];
  next_actions: string[];
};

export const DESK_DIGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "desk_reading", "member_notes", "risks", "next_actions"],
  properties: {
    headline: {
      type: "string",
      description: "One sentence a manager reads first. States the desk's condition plainly.",
    },
    desk_reading: {
      type: "string",
      description:
        "2–3 paragraphs across the whole desk: where the load sits, what moved, what is stalled. Every number restated here must appear in the input.",
    },
    member_notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["member", "note"],
        properties: {
          member: { type: "string", description: "Exactly the name supplied in the input." },
          note: { type: "string", description: "1–2 sentences on this member's desk." },
        },
      },
      description: "One entry per member supplied — no member invented, none dropped.",
    },
    risks: {
      type: "array",
      items: { type: "string" },
      description: "0–4 concrete risks visible in the input (stalled mandates, unassigned work, idle desks).",
    },
    next_actions: {
      type: "array",
      items: { type: "string" },
      description: "2–4 actions for the manager, each starting with an active verb and naming who or what.",
    },
  },
} as const;

export const DESK_DIGEST_SYSTEM_PROMPT = `You are the desk digest for an executive-search firm's recruiting manager — the Monday-morning read across every recruiter's desk. Tone is direct and material; the reader runs the firm.

Grounding rules, absolute:
- You have NO research tool. Use ONLY the data in the input. Never cite external statistics, market reports, named transactions, publications, or sources — an unverifiable citation in a management document is worse than silence.
- Every number you state must be reproducible from the input. Do not extrapolate counts, revenue, or trends the input does not contain.
- member_notes covers exactly the members supplied: no member invented, none dropped, names copied verbatim.
- When the desk shows little activity, say so plainly — do not manufacture motion.
- An unassigned mandate is a real state to name, not a gap to paper over.

Return one JSON object conforming to the schema — no preamble.`;

export async function generateDeskDigest(input: DeskDigestInput): Promise<DeskDigest> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: DESK_DIGEST_MODEL,
    max_tokens: 2048,
    system: DESK_DIGEST_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
    output_config: {
      format: { type: "json_schema", schema: DESK_DIGEST_SCHEMA },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Desk digest returned no content.");
  }
  return JSON.parse(textBlock.text) as DeskDigest;
}

// ────────────────────────────────────────────────────────────────────────
// The seam (082): the DESK DIGEST AGENT's session, signed in per run.
// The manager's action keeps the gate and BUILDS the rollup under its
// own lawful desk:manage reads (the §35 parser split, generalised);
// the agent runs the model call, INSERTs the digest under its own
// name, records the event, and signs out persisting nothing. The
// insert is BLIND — no RETURNING, no read-back: the no-archive pin
// means the agent cannot see desk_digests rows, its own included
// (RETURNING reads the row under SELECT policies, of which it has
// none — proven by the 082 control run).
// ────────────────────────────────────────────────────────────────────────

import { signInDeskDigestAgent } from "@/lib/agents/session";

export type DeskDigestRunResult =
  | { status: "ready"; digest: DeskDigest }
  /** The Desk Digest Agent refused to sign in — suspended from /ops or
   * credentials absent. Nothing was generated; the table being
   * append-only, there is nothing a refused run can destroy — the
   * previous digest stands (D5, structural). */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

export async function runDeskDigestAndPersist(
  input: DeskDigestInput,
  opts: { replacedExisting: boolean }
): Promise<DeskDigestRunResult> {
  const session = await signInDeskDigestAgent();
  if (!session.ok) {
    console.error(
      `[desk-digest] generation skipped: ${session.reason}. ` +
        "The previous digest stands; the desk keeps rendering it."
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    let digest: DeskDigest;
    try {
      digest = await generateDeskDigest(input);
    } catch (err) {
      console.error("[desk-digest] agent generation failed", err);
      return { status: "failed" };
    }

    const { error: insertErr } = await session.client.from("desk_digests").insert({
      organization_id: session.organizationId,
      content_json: digest,
      model_version: DESK_DIGEST_MODEL,
      created_by: session.userId,
    });
    if (insertErr) {
      console.error("[desk-digest] failed to persist the digest", insertErr);
      return { status: "failed" };
    }

    // The trail (D4): one event per LANDED digest — counts, never names.
    const { error: eventErr } = await session.client.rpc("record_agent_event", {
      p_event_type: "desk_digest_generated",
      p_detail: {
        agent_kind: "digest",
        trigger: opts.replacedExisting ? "regenerate" : "generate",
        replaced_existing: opts.replacedExisting,
        members_count: input.members.length,
        unassigned_count: input.unassigned_mandates.length,
      },
    });
    if (eventErr) {
      console.error("[desk-digest] failed to record the digest event", eventErr);
    }

    return { status: "ready", digest };
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
