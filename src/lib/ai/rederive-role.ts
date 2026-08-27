import "server-only";
import { runInference } from "./inference";
import {
  SENIORITY_OPTIONS,
  FUNCTION_OPTIONS,
  type CalibrationModel,
} from "./role-analysis";
import { normalizeSections, type JobSpecSections } from "./job-spec-analysis";
import { signInCalibrationAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { captureSeamError } from "@/lib/observability/sentry";

// ────────────────────────────────────────────────────────────────────────
// §177 (F-A) — the REMEDY behind the door in spec-drift.ts.
//
// The door refuses; this re-opens it. The recruiter asks explicitly, the
// CALIBRATION AGENT reads the finalised spec under its own session,
// restates the role identity from it, and stamps the calibration with
// the spec id it read.
//
// Deliberately NOT wired into `finalize_job_spec`. Making "mark as
// final" silently re-derive would mutate the basis of every past score
// without asking, and would fire an Anthropic call from a click — the
// failure spec/actions.ts already carries a comment about, where link
// prefetch silently provisioned rows and burned AI spend. The recruiter
// asks, or nothing happens.
//
// Ruling A.5: dimension_weights are NOT touched. They carry accumulated
// human judgment — health suggestions applied, HM feedback interpreted,
// recalibration_summary written — and overwriting them would discard it
// silently. If the role moved far enough that the weights are wrong,
// that is a question for the recruiter, and the diff is how it gets
// asked. This seam answers "what is the role", never "what matters".
// ────────────────────────────────────────────────────────────────────────

export const REDERIVE_ROLE_SYSTEM_PROMPT = `You are the Calibration Agent for an executive search firm.

A recruiter has finalised a job specification. Your job is to restate the ROLE IDENTITY so that every downstream agent scores candidates against the role the specification actually describes — not against an earlier guess made from a one-line brief.

You will be given:
- the FINALISED job specification (the authority)
- the CURRENT role identity (an earlier inference, possibly wrong)

Rules:
1. The finalised specification is the authority. Where it disagrees with the current role identity, the specification wins.
2. Derive role_title from the specification. Use the title the specification itself uses. Do NOT carry the old title forward because it is familiar.
3. inferred_scope must describe what this role owns according to the specification — in particular any scope the specification EXPLICITLY EXCLUDES must be named as excluded, because scoring agents read this field and will otherwise penalise candidates for lacking things the role does not require.
4. missing_information lists what the specification still does not settle. Do not invent gaps, and do not carry forward gaps the specification has since answered.
5. Never invent facts. If the specification does not say, it is missing_information.

Return only the structured object.`;

export const ROLE_REDERIVATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["role_title", "inferred_scope", "missing_information", "role_structure", "change_summary"],
  properties: {
    role_title: {
      type: "string",
      description:
        "The role title as the finalised specification states it.",
    },
    inferred_scope: {
      type: "string",
      description:
        "What this role owns per the specification, naming any scope the specification explicitly excludes.",
    },
    missing_information: {
      type: "array",
      items: { type: "string" },
      description: "What the finalised specification still does not settle.",
    },
    role_structure: {
      type: "object",
      additionalProperties: false,
      required: ["seniority", "function"],
      properties: {
        seniority: { type: "string", enum: [...SENIORITY_OPTIONS] },
        function: { type: "string", enum: [...FUNCTION_OPTIONS] },
      },
    },
    change_summary: {
      type: "string",
      description:
        "One or two sentences stating what changed against the current role identity, and why. If nothing material changed, say so plainly.",
    },
  },
} as const;

export type RoleRederivation = {
  role_title: string;
  inferred_scope: string;
  missing_information: string[];
  role_structure: { seniority: string; function: string };
  change_summary: string;
};

/** The before/after the recruiter is shown. The change is never silent. */
export type RoleDiff = {
  before: { role_title: string | null; inferred_scope: string | null };
  after: { role_title: string; inferred_scope: string };
  change_summary: string;
  spec_version: number;
};

export type RederiveRunResult =
  | { status: "ready"; calibration: Partial<CalibrationModel>; diff: RoleDiff }
  /** Project missing, or outside the agent's org-bound reach. */
  | { status: "unavailable" }
  /** No finalised spec — there is nothing authoritative to derive FROM. */
  | { status: "no_final_spec" }
  /** Suspended from /ops or credentials absent. Nothing was changed. */
  | { status: "agent_unavailable"; reason: string }
  /** Derivation or persistence failed; logged. */
  | { status: "failed" };

type ProjectSnapshot = {
  organization_id: string | null;
  calibration_model: Partial<CalibrationModel> | null;
  company_context: Record<string, unknown> | null;
};

type FinalSpecRow = {
  id: string;
  version: number;
  content_json: unknown;
};

export async function runRoleRederivationAndPersist(
  projectId: string
): Promise<RederiveRunResult> {
  const session = await signInCalibrationAgent();
  if (!session.ok) {
    console.error(
      `[rederive-role] The Calibration Agent could not run — an operator ` +
        `has suspended it or its credentials are absent. The calibration ` +
        `stands unchanged. (${session.reason})`
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("organization_id, calibration_model, company_context")
      .eq("id", projectId)
      .maybeSingle<ProjectSnapshot>();
    if (fetchError || !project) return { status: "unavailable" };

    // job_specs_agent_select makes this read lawful under the agent's own
    // session. No embed — job_specs is reached directly by project_id.
    const { data: finalSpec } = await supabase
      .from("job_specs")
      .select("id, version, content_json")
      .eq("project_id", projectId)
      .eq("is_final", true)
      .maybeSingle<FinalSpecRow>();
    if (!finalSpec) return { status: "no_final_spec" };

    const spec: JobSpecSections = normalizeSections(finalSpec.content_json);

    const userPrompt = JSON.stringify(
      {
        finalised_job_spec: spec,
        current_role_identity: {
          role_title: project.calibration_model?.role_title ?? null,
          inferred_scope: project.calibration_model?.inferred_scope ?? null,
          role_structure: project.calibration_model?.role_structure ?? null,
          missing_information:
            project.calibration_model?.missing_information ?? [],
        },
        company_context: project.company_context ?? {},
      },
      null,
      2
    );

    const system = await applySkillsToPrompt(REDERIVE_ROLE_SYSTEM_PROMPT, {
      projectId,
      organizationId: project.organization_id,
      client: supabase,
    });

    let derived: RoleRederivation;
    try {
      // Reuses the `derive_calibration` capability deliberately: same
      // agent, same class of judgment, and adding a capability would
      // churn the model registry and its tripwire for no gain.
      const response = await runInference(
        "derive_calibration",
        {
          max_tokens: 1024,
          system,
          messages: [{ role: "user", content: userPrompt }],
          output_config: {
            format: {
              type: "json_schema",
              schema: ROLE_REDERIVATION_SCHEMA,
            },
          },
        },
        { projectId }
      );
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Role rederivation response contained no text block");
      }
      derived = JSON.parse(textBlock.text) as RoleRederivation;
    } catch (err) {
      captureSeamError("[rederive-role] agent derivation failed", err);
      return { status: "failed" };
    }

    // The merge-write: role identity and the stamp. dimension_weights and
    // weights_rationale spread through UNTOUCHED (A.5).
    const merged: Partial<CalibrationModel> = {
      ...(project.calibration_model ?? {}),
      role_title: derived.role_title,
      inferred_scope: derived.inferred_scope,
      missing_information: derived.missing_information,
      role_structure:
        derived.role_structure as CalibrationModel["role_structure"],
      derived_from_spec_id: finalSpec.id,
    };

    const { error: updateError } = await supabase
      .from("projects")
      .update({
        calibration_model: merged,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    if (updateError) {
      captureSeamError(
        "[rederive-role] failed to persist the re-derived role",
        updateError
      );
      return { status: "failed" };
    }

    // The trail (A.6), under the agent's own name. The spec's TEXT never
    // rides the detail — only which spec, and the titles either side.
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "calibration_rederived",
      p_project_id: projectId,
      p_detail: {
        agent_kind: "calibration",
        spec_version: finalSpec.version,
        from_title: project.calibration_model?.role_title ?? null,
        to_title: derived.role_title,
      },
    });
    if (eventErr) {
      captureSeamError(
        "[rederive-role] failed to record the rederivation event",
        eventErr
      );
    }

    return {
      status: "ready",
      calibration: merged,
      diff: {
        before: {
          role_title: project.calibration_model?.role_title ?? null,
          inferred_scope: project.calibration_model?.inferred_scope ?? null,
        },
        after: {
          role_title: derived.role_title,
          inferred_scope: derived.inferred_scope,
        },
        change_summary: derived.change_summary,
        spec_version: finalSpec.version,
      },
    };
  } finally {
    await session.signOut();
  }
}
