import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  RELATIONSHIP_SCHEMA,
  RELATIONSHIP_SYSTEM_PROMPT,
  type RelationshipJudgment,
} from "./relationship";
import { signInRelationshipAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { buildRelationshipUpdate } from "@/lib/network/relationship-merge";
import { captureSeamError } from "@/lib/observability/sentry";

const RELATIONSHIP_MODEL = "claude-sonnet-4-6";

export type RelationshipInput = {
  profile: {
    display_name: string;
    relationship_state: string;
    disposition: Record<string, unknown>;
    follow_up_at: string | null;
    follow_up_note: string | null;
    last_meaningful_contact_at: string | null;
  };
  appearances: Array<{
    project_title: string;
    pipeline_stage: string | null;
    updated_at: string;
  }>;
  contact_history: Array<{
    direction: string;
    channel: string;
    subject: string | null;
    occurred_at: string;
  }>;
  strategies: Array<{
    status: string;
    version: number;
    angle: string | null;
  }>;
  evidence: Record<string, unknown>;
  today: string;
};

export async function generateRelationshipJudgment(
  input: RelationshipInput,
  options?: { system?: string }
): Promise<RelationshipJudgment> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: RELATIONSHIP_MODEL,
    max_tokens: 1500,
    system: options?.system ?? RELATIONSHIP_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: RELATIONSHIP_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Relationship response contained no text block");
  }
  return JSON.parse(textBlock.text) as RelationshipJudgment;
}

// ────────────────────────────────────────────────────────────────────────
// The seam (098): the CANDIDATE RELATIONSHIP AGENT's session, signed
// in per maintenance act — the TWENTY-SECOND principal, the Engage
// arc's second. The human door is the recruiter's explicit "Update
// relationship" act on the network person's card. The agent re-reads
// the profile, its candidate rows, the contact history and the
// strategies under ITS OWN session; judges with org-wide skills (a
// person is cross-project — projectId null, the digest precedent);
// merge-writes ONLY the four maintainable fields through
// buildRelationshipUpdate (the pure clamp — no dnc key can exist in
// the update, no state write on a suppressed profile); the database
// guard refuses the dnc family independently (two layers); records
// `relationship_updated` with COUNTS; signs out in a finally.
// last_meaningful_contact_at is DETERMINISTIC — the newest contact's
// timestamp, computed in code, never the model's to invent.
// ────────────────────────────────────────────────────────────────────────

export type RelationshipRunResult =
  | { status: "updated" }
  | { status: "unavailable" }
  | { status: "agent_unavailable"; reason: string }
  | { status: "failed" };

export async function runRelationshipAndPersist(
  profileId: string
): Promise<RelationshipRunResult> {
  const session = await signInRelationshipAgent();
  if (!session.ok) {
    console.error(
      `[relationship] The Candidate Relationship Agent could not run — an ` +
        `operator has suspended it or its credentials are absent. The ` +
        `relationship record is untouched. (${session.reason})`
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    const { data: profile } = await supabase
      .from("network_profiles")
      .select(
        "id, display_name, relationship_state, dnc, disposition, follow_up_at, follow_up_note, last_meaningful_contact_at"
      )
      .eq("id", profileId)
      .maybeSingle<{
        id: string;
        display_name: string;
        relationship_state: string;
        dnc: boolean;
        disposition: Record<string, unknown>;
        follow_up_at: string | null;
        follow_up_note: string | null;
        last_meaningful_contact_at: string | null;
      }>();
    if (!profile) return { status: "unavailable" };

    const { data: candidateRows } = await supabase
      .from("candidates")
      .select("id, project_id, pipeline_stage, cv_structured, updated_at")
      .eq("network_profile_id", profileId);
    const candidates = candidateRows ?? [];
    const candidateIds = candidates.map((c) => c.id as string);

    const [{ data: projects }, { data: outreach }, { data: strategies }] =
      await Promise.all([
        candidates.length > 0
          ? supabase
              .from("projects")
              .select("id, title")
              .in(
                "id",
                candidates
                  .map((c) => c.project_id as string | null)
                  .filter((x): x is string => x != null)
              )
          : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
        candidateIds.length > 0
          ? supabase
              .from("candidate_outreach")
              .select("direction, channel, subject, occurred_at")
              .in("candidate_id", candidateIds)
              .order("occurred_at", { ascending: true })
          : Promise.resolve({ data: [] }),
        candidateIds.length > 0
          ? supabase
              .from("outreach_strategies")
              .select("status, version, content")
              .in("candidate_id", candidateIds)
              .order("version", { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

    const projectTitle = new Map(
      (projects ?? []).map((p) => [p.id as string, p.title as string])
    );

    const contactHistory = (outreach ?? []).map((o) => ({
      direction: o.direction as string,
      channel: o.channel as string,
      subject: o.subject as string | null,
      occurred_at: o.occurred_at as string,
    }));
    // Deterministic: the newest contact IS the last meaningful contact.
    const lastMeaningfulContactAt =
      contactHistory.length > 0
        ? contactHistory[contactHistory.length - 1].occurred_at
        : profile.last_meaningful_contact_at;

    // Evidence rides from the newest candidate row.
    const newest = [...candidates].sort((a, b) =>
      String(b.updated_at).localeCompare(String(a.updated_at))
    )[0];
    const evidence =
      (newest?.cv_structured as Record<string, unknown> | null) ?? {};

    // Org-wide skills only — a person is cross-project (D6).
    const system = await applySkillsToPrompt(RELATIONSHIP_SYSTEM_PROMPT, {
      projectId: null,
      organizationId: session.organizationId,
      client: supabase,
    });

    let judgment: RelationshipJudgment;
    try {
      judgment = await generateRelationshipJudgment(
        {
          profile: {
            display_name: profile.display_name,
            relationship_state: profile.relationship_state,
            disposition: profile.disposition ?? {},
            follow_up_at: profile.follow_up_at,
            follow_up_note: profile.follow_up_note,
            last_meaningful_contact_at: profile.last_meaningful_contact_at,
          },
          appearances: candidates.map((c) => ({
            project_title:
              projectTitle.get(c.project_id as string) ?? "(unknown project)",
            pipeline_stage: (c.pipeline_stage ?? null) as string | null,
            updated_at: c.updated_at as string,
          })),
          contact_history: contactHistory,
          strategies: (strategies ?? []).map((s) => ({
            status: s.status as string,
            version: s.version as number,
            angle:
              ((s.content as Record<string, unknown> | null)?.angle as
                | string
                | undefined) ?? null,
          })),
          evidence,
          today: new Date().toISOString().slice(0, 10),
        },
        { system }
      );
    } catch (err) {
      captureSeamError("[relationship] agent judgment failed", err);
      return { status: "failed" };
    }

    const update = buildRelationshipUpdate({
      judgment,
      profileDnc: profile.dnc,
      lastMeaningfulContactAt,
      now: new Date(),
    });

    const { data: landed, error: updateError } = await supabase
      .from("network_profiles")
      .update(update)
      .eq("id", profileId)
      .select("id");
    if (updateError) {
      captureSeamError("[relationship] failed to persist the record", updateError);
      return { status: "failed" };
    }
    if (!landed || landed.length === 0) return { status: "unavailable" };

    // The trail (D4): COUNTS only — never a name, never disposition text.
    const dispositionFields = Object.values(judgment.disposition).filter(
      (v) => v != null && (!Array.isArray(v) || v.length > 0)
    ).length;
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "relationship_updated",
      p_detail: {
        agent_kind: "relationship",
        appearances: candidates.length,
        contacts: contactHistory.length,
        strategies: (strategies ?? []).length,
        evidence_keys: Object.keys(evidence).length,
        disposition_fields: dispositionFields,
        state: update.relationship_state ?? profile.relationship_state,
        suppressed: profile.dnc,
      },
    });
    if (eventErr) {
      captureSeamError("[relationship] failed to record the event", eventErr);
    }

    return { status: "updated" };
  } finally {
    // Persist nothing (D2): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
