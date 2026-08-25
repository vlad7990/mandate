import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { identityKey } from "@/lib/candidate-identity";
import {
  composeOutreach,
  noticeIdempotencyKey,
  NOTICE_VERSION,
  TEMPLATE_KEY,
  TEMPLATE_VERSION,
} from "@/lib/outreach/compose";
import {
  applyCommsPolicy,
  DEFAULT_COMMS_POLICY,
  type CommsPolicy,
} from "@/lib/outreach/strategy-policy";
import type { OutreachStrategyContent } from "@/lib/ai/outreach-strategy";
import {
  evaluateSendPolicy,
  type SendActor,
  type SendRefusal,
} from "./send-policy";
import { renderTextAsHtml, resendProvider, type CommsProvider } from "./resend-provider";
import { captureSeamError } from "@/lib/observability/sentry";

// ────────────────────────────────────────────────────────────────────────
// The Candidate Communication Service (099, spec §5): the ONLY path by
// which a candidate message leaves Mandate. Not an agent — a
// deterministic ladder, every branch a named refusal:
//
//   identity → channel → DNC / erasure / withdrawal / suppression →
//   Art. 14 compose (the SERVICE composes; callers pass recruiter text
//   only) → autonomy (every agent actor refused — no mission system
//   exists) → caps derived from the record → idempotent queued row
//   BEFORE the provider call → the adapter → the atomic completion
//   (provider ref + notification + stamp in one RPC).
//
// The disclosure clamp runs here too (the 095 two-layer precedent
// completes): whatever a human edited after approval, the client's
// name cannot pass an 'after_nda' policy at send time either.
// ────────────────────────────────────────────────────────────────────────

export type SendCandidateMessageInput = {
  candidateId: string;
  projectId: string;
  channel: "email";
  subject: string;
  /** Recruiter-block text ONLY — the service composes the notice. */
  recruiterBody: string;
  actor: SendActor;
  /** Deterministic per intent — a retry or double-click collides here. */
  idempotencyKey: string;
};

export type SendCandidateMessageResult =
  | {
      sent: true;
      alreadySent: false;
      outreachId: string;
      providerRef: string | null;
      noticeCarried: boolean;
    }
  | { sent: true; alreadySent: true; outreachId: string }
  | ({ sent: false; refused: true } & Pick<SendRefusal, "code" | "message">)
  | { sent: false; refused: false; reason: "provider" | "recording"; message: string };

export async function sendCandidateMessage(
  input: SendCandidateMessageInput,
  deps?: { provider?: CommsProvider }
): Promise<SendCandidateMessageResult> {
  const provider = deps?.provider ?? resendProvider;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      sent: false,
      refused: false,
      reason: "recording",
      message: "Unauthenticated.",
    };
  }

  // 1. Identity & scope — candidate, project, org resolve and agree.
  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, project_id, organization_id, full_name, email, linkedin_url, source_kind, sourced_at, subject_notified_at, pipeline_stage, source_platform, current_company, network_profile_id"
    )
    .eq("id", input.candidateId)
    .maybeSingle<{
      id: string;
      project_id: string | null;
      organization_id: string;
      full_name: string;
      email: string | null;
      linkedin_url: string | null;
      source_kind: string | null;
      sourced_at: string | null;
      subject_notified_at: string | null;
      pipeline_stage: string | null;
      source_platform: string | null;
      current_company: string | null;
      network_profile_id: string | null;
    }>();
  if (!candidate || candidate.project_id !== input.projectId) {
    return {
      sent: false,
      refused: false,
      reason: "recording",
      message: "The candidate and mandate do not agree — nothing was sent.",
    };
  }

  const [{ data: project }, { data: org }, { data: policyRow }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, company_name")
        .eq("id", input.projectId)
        .maybeSingle<{ id: string; company_name: string }>(),
      supabase
        .from("organizations")
        .select("name")
        .eq("id", candidate.organization_id)
        .maybeSingle<{ name: string }>(),
      supabase
        .from("org_comms_policy")
        .select(
          "allowed_channels, client_identity_disclosure, compensation_discussion, daily_send_cap, per_candidate_weekly_cap"
        )
        .eq("organization_id", candidate.organization_id)
        .maybeSingle<
          CommsPolicy & {
            daily_send_cap: number | null;
            per_candidate_weekly_cap: number | null;
          }
        >(),
    ]);
  const policy = policyRow ?? {
    ...DEFAULT_COMMS_POLICY,
    daily_send_cap: null,
    per_candidate_weekly_cap: null,
  };

  // 3. Suppression facts.
  const email = (candidate.email ?? "").trim().toLowerCase();
  const [profileQ, erasureQ, suppressionQ, dayCountQ, weekCountQ] =
    await Promise.all([
      candidate.network_profile_id
        ? supabase
            .from("network_profiles")
            .select("dnc, dnc_reason")
            .eq("id", candidate.network_profile_id)
            .maybeSingle<{ dnc: boolean; dnc_reason: string | null }>()
        : Promise.resolve({ data: null }),
      supabase
        .from("candidate_erasure_requests")
        .select("id")
        .eq("identity_key", identityKey(candidate))
        .is("resolved_at", null)
        .limit(1),
      email
        ? supabase
            .from("email_suppressions")
            .select("reason")
            .eq("address", email)
            .maybeSingle<{ reason: string }>()
        : Promise.resolve({ data: null }),
      supabase
        .from("candidate_outreach")
        .select("id", { count: "exact", head: true })
        .not("provider", "is", null)
        .in("delivery_status", ["queued", "sent", "delivered"])
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      supabase
        .from("candidate_outreach")
        .select("id", { count: "exact", head: true })
        .eq("candidate_id", input.candidateId)
        .not("provider", "is", null)
        .in("delivery_status", ["queued", "sent", "delivered"])
        .gte(
          "created_at",
          new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
        ),
    ]);

  // 2/3/5/6 — the ladder, pure and exhaustively tested.
  const verdict = evaluateSendPolicy({
    actor: input.actor,
    channel: input.channel,
    allowedChannels: policy.allowed_channels,
    candidateEmail: candidate.email,
    pipelineStage: candidate.pipeline_stage,
    profileDnc: profileQ.data?.dnc === true,
    dncReason: profileQ.data?.dnc_reason ?? null,
    erasureOpen: (erasureQ.data ?? []).length > 0,
    suppressed: suppressionQ.data ? { reason: suppressionQ.data.reason } : null,
    dailySendCap: policy.daily_send_cap,
    sentTodayOrgWide: dayCountQ.count ?? 0,
    weeklyCandidateCap: policy.per_candidate_weekly_cap,
    sentToCandidateThisWeek: weekCountQ.count ?? 0,
  });
  if (!verdict.ok) {
    return { sent: false, refused: true, code: verdict.code, message: verdict.message };
  }

  // The send-time disclosure clamp (layer two of 095's precedent).
  const clampContent: OutreachStrategyContent = {
    angle: "",
    career_hook: "",
    may_disclose: [],
    must_not_disclose: [],
    channel: "email",
    cadence: "",
    talking_points: [],
    likely_questions: [],
    draft_subject: input.subject.trim(),
    draft_body: input.recruiterBody.trim(),
  };
  const { content: clamped } = applyCommsPolicy(
    clampContent,
    policy,
    project?.company_name ?? null
  );

  // 4. Art. 14 — the service composes; the notice is never optional.
  const composed = composeOutreach({
    recruiterBody: clamped.draft_body,
    candidate: {
      full_name: candidate.full_name,
      source_kind: candidate.source_kind,
      sourced_at: candidate.sourced_at,
      subject_notified_at: candidate.subject_notified_at,
    },
    organizationName: org?.name ?? "Mandate",
    sourcePlatformLabel: candidate.source_platform,
    contactEmail: user.email ?? "noreply@getmandate.io",
    now: new Date(),
  });
  const subject = clamped.draft_subject || composed.subject;

  // 7. The queued row — the key lands BEFORE the provider call.
  const threadKey = `thr:${input.candidateId}:${input.projectId}`;
  const { data: queued, error: queueError } = await supabase
    .from("candidate_outreach")
    .insert({
      candidate_id: input.candidateId,
      project_id: input.projectId,
      organization_id: candidate.organization_id,
      channel: "email",
      direction: "outbound",
      subject,
      body: composed.text,
      includes_privacy_notice: composed.noticeRequired,
      occurred_at: new Date().toISOString(),
      created_by: user.id,
      provider: "resend",
      delivery_status: "queued",
      thread_key: threadKey,
      idempotency_key: input.idempotencyKey,
      sent_by_principal: false,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (queueError) {
    if (queueError.code === "23505") {
      const { data: original } = await supabase
        .from("candidate_outreach")
        .select("id")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle<{ id: string }>();
      return {
        sent: true,
        alreadySent: true,
        outreachId: original?.id ?? "",
      };
    }
    captureSeamError("[comms] failed to queue the send", queueError);
    return {
      sent: false,
      refused: false,
      reason: "recording",
      message: "The send could not be recorded — nothing was sent.",
    };
  }
  if (!queued) {
    return {
      sent: false,
      refused: false,
      reason: "recording",
      message: "The send could not be recorded — nothing was sent.",
    };
  }

  // 8. The provider.
  const providerResult = await provider({
    to: [candidate.email as string],
    subject,
    text: composed.text,
    html: renderTextAsHtml(composed.text),
    replyTo: user.email ?? undefined,
  });

  if (!providerResult.sent) {
    // Honest failure: the row says failed; a required notice records
    // its failed attempt through 044's door.
    await supabase
      .from("candidate_outreach")
      .update({ delivery_status: "failed" })
      .eq("id", queued.id);
    if (composed.noticeRequired) {
      await supabase.rpc("record_notification_failed", {
        p_candidate_id: input.candidateId,
        p_recipient: candidate.email,
        p_template_key: TEMPLATE_KEY,
        p_template_version: TEMPLATE_VERSION,
        p_notice_version: NOTICE_VERSION,
        p_error: `${providerResult.reason}: ${providerResult.detail}`.slice(0, 500),
        p_idempotency_key: `${noticeIdempotencyKey(input.candidateId)}:failed:${queued.id}`,
      });
    }
    return {
      sent: false,
      refused: false,
      reason: "provider",
      message:
        providerResult.reason === "not-configured"
          ? "Email is not configured in this environment — nothing was sent."
          : `The provider refused the send — nothing reached them. (${providerResult.detail.slice(0, 200)})`,
    };
  }

  // 9. The atomic completion. Resend returns an id on success; the
  // rare null still completes honestly with a row-derived reference —
  // the mail went, and the record must say sent.
  const providerRef = providerResult.id ?? `resend:ok:${queued.id}`;
  const { error: completeError } = await supabase.rpc("complete_candidate_send", {
    p_outreach_id: queued.id,
    p_provider_message_id: providerRef,
    ...(composed.noticeRequired
      ? {
          p_recipient: candidate.email,
          p_template_key: TEMPLATE_KEY,
          p_template_version: TEMPLATE_VERSION,
          p_notice_version: NOTICE_VERSION,
          p_notice_idempotency_key: noticeIdempotencyKey(input.candidateId),
        }
      : {}),
  });
  if (completeError) {
    captureSeamError("[comms] the send completed but the record did not", completeError);
    return {
      sent: false,
      refused: false,
      reason: "recording",
      message:
        "The email WAS sent, but recording it failed — check the contact log before sending again.",
    };
  }

  return {
    sent: true,
    alreadySent: false,
    outreachId: queued.id,
    providerRef: providerResult.id,
    noticeCarried: composed.noticeRequired,
  };
}
