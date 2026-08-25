// The merge discipline for #22's write — pure, and the reason the
// seam cannot suffer field creep (the relationship-merge pattern,
// applied to the conversation lane).
//
// The database pins the escalated row shut to the agent outright;
// this module is the layer ABOVE it: whatever the model returned,
// the update object contains ONLY the four maintainable fields, the
// state is clamped to the vocabulary, an escalation without a reason
// is refused (the state move is dropped; the lawful rest still
// lands), and the proposed draft is clamped against org_comms_policy
// through the SAME validator the strategy clamp and the send-time
// clamp use — three layers, one rule.
//
// It also carries the spec-§10 HARD GATES, deterministic-first: a
// latest inbound message that asks for a human, raises the privacy
// family, or uses legal/discrimination phrasing forces the lane to
// 'escalated' BEFORE (instead of) any model turn.

import type {
  EngagementDraft,
  EngagementJudgment,
  EngagementState,
} from "@/lib/ai/engagement";
import { ENGAGEMENT_STATES } from "@/lib/ai/engagement";
import type { OutreachStrategyContent } from "@/lib/ai/outreach-strategy";
import { applyCommsPolicy, type CommsPolicy } from "@/lib/outreach/strategy-policy";

export type EngagementUpdate = {
  state?: EngagementState;
  escalation_reason: string | null;
  next_follow_up_at: string | null;
  draft: EngagementDraft | null;
  updated_at: string;
};

export type EngagementMergeResult = {
  update: EngagementUpdate;
  /** The draft was altered by the policy clamp. */
  clamped: boolean;
  reasons: string[];
};

export function buildEngagementUpdate(args: {
  judgment: EngagementJudgment;
  policy: CommsPolicy;
  clientName: string | null;
  now: Date;
}): EngagementMergeResult {
  const { judgment, policy, clientName, now } = args;
  const reasons: string[] = [];

  const update: EngagementUpdate = {
    escalation_reason: null,
    next_follow_up_at: normaliseDate(judgment.next_follow_up_at),
    draft: null,
    updated_at: now.toISOString(),
  };

  const state = judgment.state;
  if ((ENGAGEMENT_STATES as string[]).includes(state)) {
    if (state === "escalated") {
      const reason = trimOrNull(judgment.escalation_reason);
      if (reason) {
        update.state = "escalated";
        update.escalation_reason = reason;
      } else {
        // A reasonless escalation is not a record — the state move is
        // dropped and the lane keeps its prior state.
        reasons.push("an escalation without a reason was refused");
      }
    } else {
      update.state = state;
    }
  }
  // A model that strayed outside the vocabulary writes NO state.

  // The proposed draft, clamped through the shared validator: the
  // client's name cannot pass a concealing disclosure policy, and
  // compensation content cannot pass 'human_only' — whatever the
  // model wrote. An escalated lane proposes nothing: the next move
  // is the human's.
  const draft = judgment.draft;
  if (draft && update.state !== "escalated") {
    const subject = draft.subject.trim();
    const body = draft.body.trim();
    if (body) {
      const clampInput: OutreachStrategyContent = {
        angle: "",
        career_hook: "",
        may_disclose: [],
        must_not_disclose: [],
        channel: "email",
        cadence: "",
        talking_points: [],
        likely_questions: [],
        draft_subject: subject,
        draft_body: body,
      };
      const { content, clamped, reasons: clampReasons } = applyCommsPolicy(
        clampInput,
        policy,
        clientName
      );
      if (clamped) reasons.push(...clampReasons);
      if (content.draft_body.trim()) {
        update.draft = {
          subject: content.draft_subject.trim(),
          body: content.draft_body.trim(),
        };
      } else {
        reasons.push("the clamp left no draft body — nothing is proposed");
      }
    }
  } else if (draft && update.state === "escalated") {
    reasons.push("an escalated lane proposes nothing — the draft was dropped");
  }

  return { update, clamped: reasons.length > 0, reasons };
}

// ── The spec-§10 hard gates: deterministic, before/instead of any
//    agent turn. The conversation stops and a human owns it. ──────────

const HUMAN_REQUEST_PATTERN =
  /\b(speak|talk|connect)\s+(to|with)\s+(a\s+)?(human|person|real\s+person|someone)\b|\bare\s+you\s+(a\s+)?(bot|an?\s+ai)\b/i;
const PRIVACY_PATTERN =
  /\b(unsubscribe|stop\s+(contacting|emailing|messaging)\s+me|delete\s+my\s+(data|details|information)|remove\s+me\s+from|erasure|do\s+not\s+contact)\b/i;
const LEGAL_PATTERN =
  /\b(lawyer|solicitor|attorney|legal\s+action|lawsuit|discriminat\w+|harass\w+|gdpr\s+complaint|report\s+you)\b/i;

/**
 * Returns the forced escalation reason when the latest inbound
 * message trips a hard gate, else null. Deterministic lexicon FIRST —
 * the classifier never gets a turn on these.
 */
export function detectHardEscalation(
  latestInboundText: string | null
): string | null {
  const text = (latestInboundText ?? "").trim();
  if (!text) return null;
  if (PRIVACY_PATTERN.test(text)) {
    return "the candidate used unsubscribe/deletion language — privacy workflow, human hands only";
  }
  if (HUMAN_REQUEST_PATTERN.test(text)) {
    return "the candidate asked for a human";
  }
  if (LEGAL_PATTERN.test(text)) {
    return "the candidate used legal or discrimination phrasing — human review required";
  }
  return null;
}

function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function trimOrNull(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}
