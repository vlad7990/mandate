"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { recordActivity } from "@/lib/activity/record";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The skill change";

const SKILL_TYPES = ["role_skill", "client_skill", "search_skill"] as const;
type SkillType = (typeof SKILL_TYPES)[number];

// Every active skill rides every model call for its scope — these caps
// keep one enormous paste from taxing every prompt in the product
// (§99 finding #6). Generous for real instructions, hostile to dumps.
const NAME_MAX = 120;
const DESCRIPTION_MAX = 300;
const TRIGGER_MAX = 1_000;
const INSTRUCTIONS_MAX = 4_000;

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireAuth(): Promise<AuthContext> {
  return requireActionContext("skills:write");
}

type SkillFormInput = {
  name: string;
  description: string;
  skill_type: SkillType;
  trigger_conditions: string;
  instructions: string;
  applies_to_project_id: string | null;
  applies_to_client_id: string | null;
};

function parseSkillForm(formData: FormData): SkillFormInput {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const skill_type = String(formData.get("skill_type") ?? "") as SkillType;
  const trigger_conditions = String(
    formData.get("trigger_conditions") ?? ""
  ).trim();
  const instructions = String(formData.get("instructions") ?? "").trim();
  const projectIdRaw = String(formData.get("applies_to_project_id") ?? "").trim();
  const applies_to_project_id = projectIdRaw === "" ? null : projectIdRaw;
  const clientIdRaw = String(formData.get("applies_to_client_id") ?? "").trim();
  const applies_to_client_id = clientIdRaw === "" ? null : clientIdRaw;

  if (!name) throw new Error("Name is required.");
  if (!instructions) throw new Error("Instructions are required.");
  if (name.length > NAME_MAX) {
    throw new Error(`The name is over ${NAME_MAX} characters — shorten it.`);
  }
  if (description.length > DESCRIPTION_MAX) {
    throw new Error(
      `The description is over ${DESCRIPTION_MAX} characters — it is a one-liner, not the instructions.`
    );
  }
  if (trigger_conditions.length > TRIGGER_MAX) {
    throw new Error(
      `The trigger conditions are over ${TRIGGER_MAX} characters — describe when, not what.`
    );
  }
  if (instructions.length > INSTRUCTIONS_MAX) {
    throw new Error(
      `The instructions are over ${INSTRUCTIONS_MAX} characters. Every active skill rides every agent run — split it into narrower skills instead.`
    );
  }
  if (!SKILL_TYPES.includes(skill_type)) {
    throw new Error("Invalid skill type.");
  }
  if (skill_type === "role_skill" && !applies_to_project_id) {
    throw new Error("Role skills must target a project.");
  }
  if (skill_type !== "role_skill" && applies_to_project_id) {
    throw new Error(
      "Only role skills can target a specific project. Switch the type or clear the project."
    );
  }
  // A client skill with no client stays org-wide, which is what every client
  // skill written before migration 049 is — so this is permitted, not an
  // error. Only the reverse is rejected.
  if (skill_type !== "client_skill" && applies_to_client_id) {
    throw new Error(
      "Only client skills can target a specific client. Switch the type or clear the client."
    );
  }

  return {
    name,
    description,
    skill_type,
    trigger_conditions,
    instructions,
    applies_to_project_id,
    applies_to_client_id,
  };
}

/**
 * The trail detail for a skill event: the NAME, the type, and the
 * scope — never the instructions' text (the standing text-probe
 * doctrine: steering content does not ride the trail).
 */
function skillEventDetail(input: {
  name: string;
  skill_type: SkillType;
  applies_to_project_id: string | null;
  applies_to_client_id: string | null;
}): Record<string, unknown> {
  return {
    skill: input.name,
    skill_type: input.skill_type,
    project_scoped: input.applies_to_project_id != null,
    client_scoped: input.applies_to_client_id != null,
  };
}

export async function createSkillAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const input = parseSkillForm(formData);
    const supabase = await createServerSupabaseClient();

    const { data: born, error } = await supabase
      .from("skills")
      .insert({
        organization_id: auth.organizationId,
        created_by: auth.userId,
        name: input.name,
        description: input.description,
        skill_type: input.skill_type,
        trigger_conditions: input.trigger_conditions,
        instructions: input.instructions,
        applies_to_project_id: input.applies_to_project_id,
        // §99 finding #1: this column was dropped at create time, so a
        // client-targeted skill silently landed org-wide — scope
        // WIDENING. The scope the admin picked is the scope that lands.
        applies_to_client_id: input.applies_to_client_id,
        is_active: true,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !born) {
      throw new Error(`Failed to create skill: ${error?.message ?? "nothing was saved"}`);
    }

    await recordActivity(supabase, {
      eventType: "skill_created",
      projectId: input.applies_to_project_id,
      clientId: input.applies_to_client_id,
      detail: skillEventDetail(input),
    });

    revalidatePath("/app/settings/skills");
    redirect("/app/settings/skills");
  });
}

export async function updateSkillAction(
  skillId: string,
  formData: FormData
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const input = parseSkillForm(formData);
    const supabase = await createServerSupabaseClient();

    const { data: landed, error } = await supabase
      .from("skills")
      .update({
        name: input.name,
        description: input.description,
        skill_type: input.skill_type,
        trigger_conditions: input.trigger_conditions,
        instructions: input.instructions,
        applies_to_project_id: input.applies_to_project_id,
        applies_to_client_id: input.applies_to_client_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", skillId)
      .select("id");

    if (error) {
      throw new Error(`Failed to update skill: ${error.message}`);
    }
    if (!landed || landed.length === 0) {
      throw new Error(
        "Nothing was saved — the skill no longer exists or is not yours to edit. Reload the page."
      );
    }

    await recordActivity(supabase, {
      eventType: "skill_updated",
      projectId: input.applies_to_project_id,
      clientId: input.applies_to_client_id,
      detail: skillEventDetail(input),
    });

    revalidatePath("/app/settings/skills");
    redirect("/app/settings/skills");
  });
}

export async function toggleSkillActiveAction(
  skillId: string,
  isActive: boolean
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: landed, error } = await supabase
      .from("skills")
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", skillId)
      .select("name, skill_type, applies_to_project_id, applies_to_client_id");

    if (error) {
      throw new Error(`Failed to toggle skill: ${error.message}`);
    }
    const row = landed?.[0];
    if (!row) {
      throw new Error(
        "Nothing was changed — the skill no longer exists or is not yours to change. Reload the page."
      );
    }

    await recordActivity(supabase, {
      eventType: isActive ? "skill_activated" : "skill_paused",
      projectId: row.applies_to_project_id,
      clientId: row.applies_to_client_id,
      detail: skillEventDetail(row),
    });

    revalidatePath("/app/settings/skills");
  });
}

export async function deleteSkillAction(skillId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: gone, error } = await supabase
      .from("skills")
      .delete()
      .eq("id", skillId)
      .select("name, skill_type, applies_to_project_id, applies_to_client_id");

    if (error) {
      throw new Error(`Failed to delete skill: ${error.message}`);
    }
    const row = gone?.[0];
    if (!row) {
      throw new Error(
        "Nothing was deleted — the skill no longer exists or is not yours to delete. Reload the page."
      );
    }

    await recordActivity(supabase, {
      eventType: "skill_deleted",
      projectId: row.applies_to_project_id,
      clientId: row.applies_to_client_id,
      detail: skillEventDetail(row),
    });

    revalidatePath("/app/settings/skills");
  });
}
