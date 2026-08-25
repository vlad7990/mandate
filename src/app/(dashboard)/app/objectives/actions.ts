"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertCapability } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { recordActivity } from "@/lib/activity/record";
import {
  FINANCIAL_METRICS,
  QUANTITATIVE_METRICS,
  type KeyResultKind,
} from "@/lib/okrs/types";

// ── The OKR domain (107) ─────────────────────────────────────────────
//
// Setting and closing objectives are okr-writer acts (D2); the RLS
// owner-or-desk predicates and the owner guard trigger are the
// boundary, and these actions surface their sentences. The events
// carry titles, scopes and outcomes — NEVER amounts (R1: the trail
// rows are org-visible and the money is not).

const OBJECTIVE_TITLE_MAX = 140;
const OBJECTIVE_DETAIL_MAX = 1_000;
const KEY_RESULT_LABEL_MAX = 140;

async function memberLabel(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle<{ full_name: string | null; email: string }>();
  return data?.full_name || data?.email || null;
}

function revalidateOkrSurfaces() {
  revalidatePath("/app/objectives");
  revalidatePath("/app/analytics");
  revalidatePath("/app/placements");
}

export async function createObjectiveAction(formData: FormData): Promise<ActionResult> {
  return runAction("The objective", async () => {
    const access = await assertCapability("okrs:write");
    const title = String(formData.get("title") ?? "").trim();
    const detail = String(formData.get("detail") ?? "").trim();
    const ownerRaw = String(formData.get("owner_user_id") ?? "").trim();
    const projectRaw = String(formData.get("project_id") ?? "").trim();
    const periodStart = String(formData.get("period_start") ?? "").trim();
    const periodEnd = String(formData.get("period_end") ?? "").trim();

    if (!title) throw new Error("Title is required.");
    if (title.length > OBJECTIVE_TITLE_MAX) {
      throw new Error(`The title is over ${OBJECTIVE_TITLE_MAX} characters — shorten it.`);
    }
    if (detail.length > OBJECTIVE_DETAIL_MAX) {
      throw new Error(`The detail is over ${OBJECTIVE_DETAIL_MAX} characters.`);
    }
    if (!periodStart || !periodEnd) {
      throw new Error("An objective needs a period — a start and an end date.");
    }
    if (periodEnd < periodStart) {
      throw new Error("The period ends before it starts.");
    }
    const ownerId = ownerRaw === "" ? access.userId : ownerRaw;
    const projectId = projectRaw === "" ? null : projectRaw;

    const supabase = await createServerSupabaseClient();
    const { data: born, error } = await supabase
      .from("objectives")
      .insert({
        organization_id: access.organizationId,
        project_id: projectId,
        owner_user_id: ownerId,
        title,
        detail,
        period_start: periodStart,
        period_end: periodEnd,
        created_by: access.userId,
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !born) {
      throw new Error(`Failed to create objective: ${error?.message ?? "nothing was saved"}`);
    }

    await recordActivity(supabase, {
      eventType: "objective_created",
      projectId,
      detail: {
        title,
        scope: projectId ? "mandate" : "book",
        owner_label: await memberLabel(supabase, ownerId),
      },
    });

    revalidateOkrSurfaces();
  });
}

export async function addKeyResultAction(formData: FormData): Promise<ActionResult> {
  return runAction("The key result", async () => {
    const access = await assertCapability("okrs:write");
    const objectiveId = String(formData.get("objective_id") ?? "").trim();
    const kind = String(formData.get("kind") ?? "").trim() as KeyResultKind;
    const label = String(formData.get("label") ?? "").trim();
    const metricRaw = String(formData.get("metric_source") ?? "").trim();
    const targetRaw = String(formData.get("target_value") ?? "").trim();
    const currencyRaw = String(formData.get("currency") ?? "").trim().toUpperCase();
    const directionRaw = String(formData.get("direction") ?? "").trim();

    if (!objectiveId) throw new Error("The key result has no objective.");
    if (!label) throw new Error("A label is required.");
    if (label.length > KEY_RESULT_LABEL_MAX) {
      throw new Error(`The label is over ${KEY_RESULT_LABEL_MAX} characters — shorten it.`);
    }
    if (!["financial", "quantitative", "qualitative"].includes(kind)) {
      throw new Error("Pick a kind: financial, quantitative or qualitative.");
    }
    const direction = directionRaw === "at_most" ? "at_most" : "at_least";

    // Mirror the 107 CHECKs with sentences a person can act on; the
    // constraints still refuse anything that slips past.
    let metricSource: string | null = null;
    let targetValue: number | null = null;
    let currency: string | null = null;
    if (kind === "qualitative") {
      if (metricRaw || targetRaw) {
        throw new Error("A qualitative milestone has no metric or target — it is attested, not measured.");
      }
    } else {
      const vocabulary: readonly string[] =
        kind === "financial" ? FINANCIAL_METRICS : QUANTITATIVE_METRICS;
      if (!vocabulary.includes(metricRaw)) {
        throw new Error("Pick a metric from the vocabulary.");
      }
      metricSource = metricRaw;
      targetValue = Number(targetRaw);
      if (!Number.isFinite(targetValue) || targetValue <= 0) {
        throw new Error("The target must be a number above zero.");
      }
      if (kind === "financial") {
        if (!/^[A-Z]{3}$/.test(currencyRaw)) {
          throw new Error("A financial target needs a three-letter currency.");
        }
        currency = currencyRaw;
      }
    }

    const supabase = await createServerSupabaseClient();
    const { data: born, error } = await supabase
      .from("objective_key_results")
      .insert({
        organization_id: access.organizationId,
        objective_id: objectiveId,
        kind,
        label,
        metric_source: metricSource,
        target_value: targetValue,
        currency,
        direction,
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !born) {
      throw new Error(
        error
          ? `Failed to add the key result: ${error.message}`
          : "Nothing was saved — only the objective's owner or the desk adds key results."
      );
    }

    revalidateOkrSurfaces();
  });
}

/**
 * Attest a qualitative milestone — the owner's or the desk's act. The
 * RLS pin signs it with the actor's own name and a zero-row landing
 * is LOUD.
 */
export async function attestKeyResultAction(keyResultId: string): Promise<ActionResult> {
  return runAction("The key result", async () => {
    const access = await assertCapability("okrs:write");
    const supabase = await createServerSupabaseClient();

    const { data: row } = await supabase
      .from("objective_key_results")
      .select("id, kind, attested_at")
      .eq("id", keyResultId)
      .maybeSingle<{ id: string; kind: string; attested_at: string | null }>();
    if (!row) throw new Error("Key result not found.");
    if (row.kind !== "qualitative") {
      throw new Error("Only a qualitative milestone is attested — the measured kinds compute themselves.");
    }
    if (row.attested_at) throw new Error("This milestone is already attested.");

    const { data: landed, error } = await supabase
      .from("objective_key_results")
      .update({
        attested_at: new Date().toISOString(),
        attested_by: access.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", keyResultId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !landed) {
      throw new Error(
        error
          ? `Failed to attest: ${error.message}`
          : "Nothing was saved — only the objective's owner or the desk attests a milestone."
      );
    }

    revalidateOkrSurfaces();
  });
}

export async function closeObjectiveAction(
  objectiveId: string,
  outcome: "met" | "missed"
): Promise<ActionResult> {
  return runAction("The objective", async () => {
    const access = await assertCapability("okrs:write");
    if (outcome !== "met" && outcome !== "missed") {
      throw new Error("A close is met or missed — abandoning is its own act.");
    }
    const supabase = await createServerSupabaseClient();

    const { data: objective } = await supabase
      .from("objectives")
      .select("id, title, project_id, status")
      .eq("id", objectiveId)
      .maybeSingle<{ id: string; title: string; project_id: string | null; status: string }>();
    if (!objective) throw new Error("Objective not found.");
    if (objective.status === "closed" || objective.status === "abandoned") {
      throw new Error(`This objective is already ${objective.status}.`);
    }

    const { data: landed, error } = await supabase
      .from("objectives")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: access.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", objectiveId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !landed) {
      throw new Error(
        error
          ? `Failed to close: ${error.message}`
          : "Nothing was saved — only the objective's owner or the desk closes it."
      );
    }

    await recordActivity(supabase, {
      eventType: "objective_closed",
      projectId: objective.project_id,
      detail: { title: objective.title, outcome },
    });

    revalidateOkrSurfaces();
  });
}

export async function abandonObjectiveAction(objectiveId: string): Promise<ActionResult> {
  return runAction("The objective", async () => {
    await assertCapability("okrs:write");
    const supabase = await createServerSupabaseClient();

    const { data: objective } = await supabase
      .from("objectives")
      .select("id, title, project_id, status")
      .eq("id", objectiveId)
      .maybeSingle<{ id: string; title: string; project_id: string | null; status: string }>();
    if (!objective) throw new Error("Objective not found.");
    if (objective.status === "closed" || objective.status === "abandoned") {
      throw new Error(`This objective is already ${objective.status}.`);
    }

    const { data: landed, error } = await supabase
      .from("objectives")
      .update({ status: "abandoned", updated_at: new Date().toISOString() })
      .eq("id", objectiveId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !landed) {
      throw new Error(
        error
          ? `Failed to abandon: ${error.message}`
          : "Nothing was saved — only the objective's owner or the desk abandons it."
      );
    }

    await recordActivity(supabase, {
      eventType: "objective_closed",
      projectId: objective.project_id,
      detail: { title: objective.title, outcome: "abandoned" },
    });

    revalidateOkrSurfaces();
  });
}
