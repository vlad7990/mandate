"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { recordActivity } from "@/lib/activity/record";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { CAPABILITY_MODEL, type Capability } from "@/lib/ai/model-map";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The model registry change";

/**
 * The model registry's write surface (LLM router slice 4, gate
 * 1885da9). The database triggers in migration 120 are the law —
 * active only from benchmarking, evidence required to activate, an
 * assignment only to an active model, no retiring an assigned model.
 * These actions are the convenience layer over it: they validate the
 * obvious, write under the admin's own session (RLS admin-only), and
 * surface the trigger's OWN sentence when it refuses. The trail
 * detail carries names, tiers and statuses — never key env-var names,
 * never prompt text.
 */

async function requireAuth() {
  return requireActionContext("models:write");
}

const MODEL_ID_MAX = 100;
const REF_MAX = 300;
const NAME_MAX = 50;
const ENV_VAR_MAX = 64;
const REGION_MAX = 80;

const MODEL_STATUSES = ["benchmarking", "active", "retired"] as const;
type ModelStatus = (typeof MODEL_STATUSES)[number];

const TIERS = ["economy", "standard", "premium"] as const;
type Tier = (typeof TIERS)[number];

function parseCapability(value: unknown): Capability {
  if (
    typeof value !== "string" ||
    !Object.prototype.hasOwnProperty.call(CAPABILITY_MODEL, value)
  ) {
    throw new Error("Unknown capability — the slugs come from the code map.");
  }
  return value as Capability;
}

export async function addProviderAction(
  formData: FormData
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const name = String(formData.get("name") ?? "").trim().toLowerCase();
    const keyEnvVar = String(formData.get("key_env_var") ?? "").trim();
    const dataRegion =
      String(formData.get("data_region") ?? "").trim() || null;

    if (!name) throw new Error("The provider needs a name.");
    if (name.length > NAME_MAX) {
      throw new Error(`The provider name is over ${NAME_MAX} characters.`);
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
      throw new Error(
        "Provider names are lowercase slugs — letters, digits, dash, underscore."
      );
    }
    // The NAME of an env var, never a value. The pattern cannot admit
    // a key; the secret itself is set in Vercel by hand.
    if (!/^[A-Z][A-Z0-9_]*$/.test(keyEnvVar) || keyEnvVar.length > ENV_VAR_MAX) {
      throw new Error(
        "The key env var must be an environment variable NAME (UPPER_SNAKE_CASE) — never paste a key here."
      );
    }
    if (dataRegion && dataRegion.length > REGION_MAX) {
      throw new Error(`The data region note is over ${REGION_MAX} characters.`);
    }

    const supabase = await createServerSupabaseClient();
    const { data: born, error } = await supabase
      .from("model_providers")
      .insert({
        name,
        // J.4: the CHECK admits only 'anthropic' until a second adapter
        // ships; the form does not offer a choice the database refuses.
        adapter_kind: "anthropic",
        key_env_var: keyEnvVar,
        data_region: dataRegion,
      })
      .select("name")
      .maybeSingle<{ name: string }>();

    if (error || !born) {
      throw new Error(
        `Failed to add the provider: ${error?.message ?? "nothing was saved"}`
      );
    }

    await recordActivity(supabase, {
      eventType: "model_provider_added",
      detail: { kind: "provider", provider: name },
    });

    revalidatePath("/app/settings/models");
  });
}

export async function addModelAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const modelId = String(formData.get("model_id") ?? "").trim();
    const provider = String(formData.get("provider") ?? "").trim();
    const tierRaw = String(formData.get("tier") ?? "").trim();

    if (!modelId) throw new Error("The model needs its provider's model id.");
    if (modelId.length > MODEL_ID_MAX) {
      throw new Error(`The model id is over ${MODEL_ID_MAX} characters.`);
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(modelId)) {
      throw new Error(
        "Model ids are the provider's own strings — lowercase letters, digits, dots, dashes."
      );
    }
    if (!provider) throw new Error("Pick a provider.");
    const tier = TIERS.includes(tierRaw as Tier) ? (tierRaw as Tier) : null;

    const supabase = await createServerSupabaseClient();
    // Status is deliberately not sent: the column defaults to
    // 'benchmarking', and the trigger refuses active-at-birth anyway.
    const { data: born, error } = await supabase
      .from("provider_models")
      .insert({ model_id: modelId, provider, tier })
      .select("model_id")
      .maybeSingle<{ model_id: string }>();

    if (error || !born) {
      throw new Error(
        `Failed to add the model: ${error?.message ?? "nothing was saved"}`
      );
    }

    await recordActivity(supabase, {
      eventType: "model_provider_added",
      detail: { kind: "model", model_id: modelId, provider, tier },
    });

    revalidatePath("/app/settings/models");
  });
}

/**
 * One status action for the lifecycle's three legal moves —
 * benchmarking → active (with evidence), active → retired, and
 * retired → benchmarking (the re-entry the activation gate requires).
 * The triggers refuse everything else with their own sentence.
 */
export async function setModelStatusAction(
  modelId: string,
  status: ModelStatus,
  benchmarkRef?: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    if (!MODEL_STATUSES.includes(status)) {
      throw new Error("Unknown model status.");
    }
    const ref = benchmarkRef?.trim() || null;
    if (status === "active" && !ref) {
      throw new Error(
        "Activation needs the eval evidence — name the benchmark results behind it."
      );
    }
    if (ref && ref.length > REF_MAX) {
      throw new Error(`The benchmark reference is over ${REF_MAX} characters.`);
    }

    const supabase = await createServerSupabaseClient();
    const { data: before } = await supabase
      .from("provider_models")
      .select("status")
      .eq("model_id", modelId)
      .maybeSingle<{ status: string }>();

    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === "active") patch.benchmark_ref = ref;

    const { data: landed, error } = await supabase
      .from("provider_models")
      .update(patch)
      .eq("model_id", modelId)
      .select("model_id");

    if (error) {
      throw new Error(error.message);
    }
    if (!landed || landed.length === 0) {
      throw new Error(
        "Nothing was changed — the model no longer exists or is not yours to change. Reload the page."
      );
    }

    await recordActivity(supabase, {
      eventType: "model_assignment_changed",
      detail: {
        kind: "status",
        model_id: modelId,
        from: before?.status ?? null,
        to: status,
      },
    });

    revalidatePath("/app/settings/models");
  });
}

export async function setAssignmentAction(
  capabilityRaw: string,
  modelId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const capability = parseCapability(capabilityRaw);
    if (!modelId.trim()) throw new Error("Pick a model.");

    const supabase = await createServerSupabaseClient();
    const { data: before } = await supabase
      .from("capability_assignments")
      .select("model_id")
      .eq("capability", capability)
      .maybeSingle<{ model_id: string }>();

    const { data: landed, error } = await supabase
      .from("capability_assignments")
      .upsert({
        capability,
        model_id: modelId,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .select("capability");

    if (error) {
      throw new Error(error.message);
    }
    if (!landed || landed.length === 0) {
      throw new Error("Nothing was saved. Reload the page.");
    }

    await recordActivity(supabase, {
      eventType: "model_assignment_changed",
      detail: {
        kind: "assignment",
        capability,
        model_id: modelId,
        from: before?.model_id ?? null,
        to: modelId,
      },
    });

    revalidatePath("/app/settings/models");
  });
}

export async function clearAssignmentAction(
  capabilityRaw: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const capability = parseCapability(capabilityRaw);

    const supabase = await createServerSupabaseClient();
    const { data: gone, error } = await supabase
      .from("capability_assignments")
      .delete()
      .eq("capability", capability)
      .select("model_id");

    if (error) {
      throw new Error(error.message);
    }
    const row = gone?.[0];
    if (!row) {
      throw new Error(
        "Nothing was cleared — the capability has no override. Reload the page."
      );
    }

    await recordActivity(supabase, {
      eventType: "model_assignment_changed",
      detail: {
        kind: "assignment",
        capability,
        model_id: row.model_id,
        from: row.model_id,
        to: null,
      },
    });

    revalidatePath("/app/settings/models");
  });
}
