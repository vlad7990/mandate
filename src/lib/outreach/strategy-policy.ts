// The disclosure clamp — layer one of the two-layer policy check
// (D6; the comms service re-checks independently in 099, the 095
// two-layer precedent).
//
// The model is TOLD the policy in its prompt, but a prompt is a
// request, not a guarantee. This module is the guarantee: a pure,
// deterministic pass over the drafted strategy that clamps it to
// org_comms_policy BEFORE anything is persisted. A draft cannot
// smuggle the client's name past an 'after_nda' policy, cannot open
// a compensation conversation under 'human_only', and cannot pick a
// channel the org has not allowed — whatever the model wrote.
//
// Clamping is preferred to refusing: the recruiter still gets a
// usable draft, the trail records policy_clamped = true (counts
// only), and nothing silently pretends the model obeyed.

import type { OutreachStrategyContent } from "@/lib/ai/outreach-strategy";

export type CommsPolicy = {
  allowed_channels: string[];
  client_identity_disclosure: "never" | "after_approval" | "after_nda" | "open";
  compensation_discussion: "human_only" | "range_allowed";
};

/** What an absent org_comms_policy row means — the migration's defaults. */
export const DEFAULT_COMMS_POLICY: CommsPolicy = {
  allowed_channels: ["email"],
  client_identity_disclosure: "after_approval",
  compensation_discussion: "human_only",
};

export type ClampResult = {
  content: OutreachStrategyContent;
  clamped: boolean;
  /** Honest, human-readable list of what the clamp changed. */
  reasons: string[];
};

const CLIENT_STAND_IN = "a confidential client";
const COMP_PATTERN =
  /\b(salary|salaries|compensation|comp\s+package|remuneration|base\s+pay|bonus(es)?|equity|stock\s+options?|OTE)\b/i;

function scrubName(text: string, name: string, standIn: string): string {
  if (!name.trim()) return text;
  // Case-insensitive, occurrence-by-occurrence: a policy that conceals
  // the client must conceal it regardless of how the model cased it.
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), standIn);
}

function containsName(text: string, name: string): boolean {
  if (!name.trim()) return false;
  return text.toLowerCase().includes(name.trim().toLowerCase());
}

/** Drop the sentences of a paragraph that open a forbidden topic. */
function dropMatchingSentences(text: string, pattern: RegExp): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !pattern.test(sentence))
    .join(" ")
    .trim();
}

export function applyCommsPolicy(
  content: OutreachStrategyContent,
  policy: CommsPolicy,
  clientName: string | null
): ClampResult {
  const reasons: string[] = [];
  const next: OutreachStrategyContent = {
    ...content,
    may_disclose: [...content.may_disclose],
    must_not_disclose: [...content.must_not_disclose],
    talking_points: [...content.talking_points],
    likely_questions: [...content.likely_questions],
  };

  // 1. Channel: only what the org allows. An empty allowed list would
  //    make every strategy unsendable — treat it as the default.
  const allowed =
    policy.allowed_channels.length > 0
      ? policy.allowed_channels
      : DEFAULT_COMMS_POLICY.allowed_channels;
  if (!allowed.includes(next.channel)) {
    const fallback = (allowed[0] ?? "email") as OutreachStrategyContent["channel"];
    reasons.push(
      `channel '${next.channel}' is not in the org's allowed set — clamped to '${fallback}'`
    );
    next.channel = fallback;
  }

  // 2. Client identity: under 'never'/'after_nda' the client's name
  //    cannot appear anywhere in the strategy.
  const concealClient =
    policy.client_identity_disclosure === "never" ||
    policy.client_identity_disclosure === "after_nda";
  if (concealClient && clientName && clientName.trim()) {
    const fields: Array<[keyof OutreachStrategyContent, string]> = [
      ["angle", next.angle],
      ["career_hook", next.career_hook],
      ["cadence", next.cadence],
      ["draft_subject", next.draft_subject],
      ["draft_body", next.draft_body],
    ];
    let found = false;
    for (const [key, value] of fields) {
      if (containsName(value, clientName)) {
        found = true;
        (next[key] as string) = scrubName(value, clientName, CLIENT_STAND_IN);
      }
    }
    next.may_disclose = next.may_disclose.filter((item) => {
      const hit = containsName(item, clientName);
      if (hit) found = true;
      return !hit;
    });
    next.talking_points = next.talking_points.map((item) => {
      if (!containsName(item, clientName)) return item;
      found = true;
      return scrubName(item, clientName, CLIENT_STAND_IN);
    });
    next.likely_questions = next.likely_questions.map((item) => {
      if (!containsName(item, clientName)) return item;
      found = true;
      return scrubName(item, clientName, CLIENT_STAND_IN);
    });
    if (found) {
      reasons.push(
        `the client's identity is '${policy.client_identity_disclosure}' — the name was scrubbed from the draft`
      );
    }
    if (
      !next.must_not_disclose.some((item) =>
        /client('s)?\s+(identity|name)/i.test(item)
      )
    ) {
      next.must_not_disclose.push("the client's identity");
    }
  }

  // 3. Compensation: under 'human_only' the draft cannot open the
  //    topic — offending points are dropped, offending sentences cut.
  if (policy.compensation_discussion === "human_only") {
    const beforePoints = next.talking_points.length;
    next.talking_points = next.talking_points.filter(
      (item) => !COMP_PATTERN.test(item)
    );
    const droppedPoints = beforePoints - next.talking_points.length;

    let bodyCut = false;
    if (COMP_PATTERN.test(next.draft_body)) {
      next.draft_body = dropMatchingSentences(next.draft_body, COMP_PATTERN);
      bodyCut = true;
    }
    if (COMP_PATTERN.test(next.draft_subject)) {
      next.draft_subject = "An opportunity worth a conversation";
      bodyCut = true;
    }
    if (droppedPoints > 0 || bodyCut) {
      reasons.push(
        "compensation is human-only for this org — compensation content was removed from the draft"
      );
    }
    if (
      (droppedPoints > 0 || bodyCut) &&
      !next.must_not_disclose.some((item) => COMP_PATTERN.test(item))
    ) {
      next.must_not_disclose.push("compensation details");
    }
  }

  return { content: next, clamped: reasons.length > 0, reasons };
}
