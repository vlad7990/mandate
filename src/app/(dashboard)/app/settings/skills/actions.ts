"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The skill change";

const SKILL_TYPES = ["role_skill", "client_skill", "search_skill"] as const;
type SkillType = (typeof SKILL_TYPES)[number];

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

export async function createSkillAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const input = parseSkillForm(formData);
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.from("skills").insert({
      organization_id: auth.organizationId,
      created_by: auth.userId,
      name: input.name,
      description: input.description,
      skill_type: input.skill_type,
      trigger_conditions: input.trigger_conditions,
      instructions: input.instructions,
      applies_to_project_id: input.applies_to_project_id,
      is_active: true,
    });

    if (error) {
      throw new Error(`Failed to create skill: ${error.message}`);
    }

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

    const { error } = await supabase
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
      .eq("id", skillId);

    if (error) {
      throw new Error(`Failed to update skill: ${error.message}`);
    }

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

    const { error } = await supabase
      .from("skills")
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", skillId);

    if (error) {
      throw new Error(`Failed to toggle skill: ${error.message}`);
    }

    revalidatePath("/app/settings/skills");
  });
}

export async function deleteSkillAction(skillId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.from("skills").delete().eq("id", skillId);

    if (error) {
      throw new Error(`Failed to delete skill: ${error.message}`);
    }

    revalidatePath("/app/settings/skills");
  });
}
