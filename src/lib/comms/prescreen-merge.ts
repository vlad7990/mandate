// The merge discipline for #23's write — pure, and the layer that
// makes the NO-VERDICT doctrine unconditional (the engagement-merge
// pattern, applied to the pre-screen record).
//
// Whatever the model returned: the update object carries ONLY the
// maintainable fields; any key matching /score|pass|verdict|qualif/i
// is STRIPPED recursively before persistence (the schema's closed
// shapes make one inexpressible, this makes it impossible — belt and
// braces, the coverage-agent precedent); a reasonless escalation is
// refused; completion carries its stamp; an escalated pre-screen
// proposes nothing; and the proposed questions are clamped against
// org_comms_policy through the SAME validator as 097's drafts,
// 100's proposals, and 099's sends — the fourth reuse of one rule.
//
// The transcript is DETERMINISTIC: copied from the thread by the
// seam, handed in here, never the model's to write from memory.

import type {
  EvidenceEntry,
  InterestProfile,
  PrescreenJudgment,
  PrescreenQuestionSet,
  ProfessionalEvidence,
} from "@/lib/ai/prescreen";
import { INTEREST_LEVELS } from "@/lib/ai/prescreen";
import { DIMENSION_KEYS } from "@/lib/ai/onboarding-analysis";
import type { OutreachStrategyContent } from "@/lib/ai/outreach-strategy";
import { applyCommsPolicy, type CommsPolicy } from "@/lib/outreach/strategy-policy";

const VERDICT_KEY = /score|pass|verdict|qualif/i;

export type TranscriptTurn = {
  direction: string;
  channel: string;
  subject: string | null;
  body: string | null;
  occurred_at: string;
};

export type PrescreenUpdate = {
  status?: "proposed" | "in_progress" | "complete" | "escalated";
  escalation_reason: string | null;
  completed_at: string | null;
  question_set: PrescreenQuestionSet | null;
  transcript: TranscriptTurn[];
  professional_evidence: ProfessionalEvidence;
  interest_profile: InterestProfile;
  updated_at: string;
};

export type PrescreenMergeResult = {
  update: PrescreenUpdate;
  clamped: boolean;
  reasons: string[];
};

/** Recursively remove any verdict-shaped key. Arrays keep their shape. */
export function stripVerdictKeys<T>(value: T, hits?: string[]): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripVerdictKeys(v, hits)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (VERDICT_KEY.test(key)) {
        hits?.push(key);
        continue;
      }
      out[key] = stripVerdictKeys(v, hits);
    }
    return out as T;
  }
  return value;
}

const EVIDENCE_STATUSES = ["validated", "partial", "unknown"] as const;

function cleanEvidence(
  input: ProfessionalEvidence,
  reasons: string[]
): ProfessionalEvidence {
  const out: ProfessionalEvidence = {};
  for (const key of DIMENSION_KEYS) {
    const entry = input[key];
    if (!entry) continue;
    if (!(EVIDENCE_STATUSES as readonly string[]).includes(entry.status)) {
      reasons.push(
        `evidence '${key}' carried an out-of-vocabulary status — coerced to unknown`
      );
      out[key] = { value: entry.value ?? null, status: "unknown", source: entry.source ?? null };
      continue;
    }
    out[key] = {
      value: trimOrNull(entry.value),
      status: entry.status,
      source: trimOrNull(entry.source),
    } as EvidenceEntry;
  }
  return out;
}

export function buildPrescreenUpdate(args: {
  judgment: PrescreenJudgment;
  policy: CommsPolicy;
  clientName: string | null;
  transcript: TranscriptTurn[];
  now: Date;
}): PrescreenMergeResult {
  const { judgment, policy, clientName, transcript, now } = args;
  const reasons: string[] = [];
  const stripped: string[] = [];

  const judged = stripVerdictKeys(judgment, stripped);
  if (stripped.length > 0) {
    reasons.push(
      `verdict-shaped keys were stripped before persistence (${stripped.join(", ")})`
    );
  }

  const interest = (INTEREST_LEVELS as readonly string[]).includes(
    judged.interest_profile?.interest ?? ""
  )
    ? judged.interest_profile.interest
    : "unknown";
  if (interest !== judged.interest_profile?.interest) {
    reasons.push("interest was out of vocabulary — coerced to unknown");
  }

  const update: PrescreenUpdate = {
    escalation_reason: null,
    completed_at: null,
    question_set: null,
    transcript,
    professional_evidence: cleanEvidence(judged.professional_evidence ?? {}, reasons),
    interest_profile: {
      interest,
      motivation: trimOrNull(judged.interest_profile?.motivation),
      timing: trimOrNull(judged.interest_profile?.timing),
      location: trimOrNull(judged.interest_profile?.location),
      comp_context: trimOrNull(judged.interest_profile?.comp_context),
      notice: trimOrNull(judged.interest_profile?.notice),
      constraints: trimOrNull(judged.interest_profile?.constraints),
      questions: (judged.interest_profile?.questions ?? []).filter(
        (q) => typeof q === "string" && q.trim() !== ""
      ),
    },
    updated_at: now.toISOString(),
  };

  const status = judged.status;
  if (["proposed", "in_progress", "complete", "escalated"].includes(status)) {
    if (status === "escalated") {
      const reason = trimOrNull(judged.escalation_reason);
      if (reason) {
        update.status = "escalated";
        update.escalation_reason = reason;
      } else {
        reasons.push("an escalation without a reason was refused");
      }
    } else {
      update.status = status;
      if (status === "complete") {
        update.completed_at = now.toISOString();
      }
    }
  }
  // Out-of-vocabulary (including 'abandoned' — a human act) writes NO
  // status.

  const qs = judged.question_set;
  if (qs && update.status !== "escalated") {
    const body = (qs.body ?? "").trim();
    const questions = (qs.questions ?? []).filter(
      (q) => typeof q === "string" && q.trim() !== ""
    );
    if (body || questions.length > 0) {
      const clampInput: OutreachStrategyContent = {
        angle: "",
        career_hook: "",
        may_disclose: [],
        must_not_disclose: [],
        channel: "email",
        cadence: "",
        talking_points: questions,
        likely_questions: [],
        draft_subject: (qs.subject ?? "").trim(),
        draft_body: body,
      };
      const { content, clamped, reasons: clampReasons } = applyCommsPolicy(
        clampInput,
        policy,
        clientName
      );
      if (clamped) reasons.push(...clampReasons);
      if (content.draft_body.trim() || content.talking_points.length > 0) {
        update.question_set = {
          subject: content.draft_subject.trim(),
          body: content.draft_body.trim(),
          questions: content.talking_points,
        };
      } else {
        reasons.push("the clamp left no question set — nothing is proposed");
      }
    }
  } else if (qs && update.status === "escalated") {
    reasons.push(
      "an escalated pre-screen proposes nothing — the question set was dropped"
    );
  }

  return { update, clamped: reasons.length > 0, reasons };
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}
