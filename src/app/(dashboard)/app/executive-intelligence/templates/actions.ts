"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { recordExecutiveAuditEvent } from "@/lib/executive/audit";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { ROLE_FAMILIES, TEMPLATE_DEFAULT_FIELDS } from "./template-fields";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The template change";

// Same discipline as the skills studio: generous for real content,
// hostile to dumps. Every default is prompt-adjacent — it prefills the
// intake that the agents then read.
const TITLE_MAX = 120;
const KEY_MAX = 80;
const SUMMARY_MAX = 300;
const DEFAULT_MAX = 1_000;

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireAuth(): Promise<AuthContext> {
  return requireActionContext("skills:write");
}

type TemplateFormInput = {
  title: string;
  key: string;
  summary: string;
  role_family: string;
  intake_defaults: Record<string, string>;
  competency_weights: Array<{ competency_key: string; weight: number }>;
};

function parseTemplateForm(formData: FormData): TemplateFormInput {
  const title = String(formData.get("title") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const role_family = String(formData.get("role_family") ?? "other").trim();

  if (!title) throw new Error("Title is required.");
  if (title.length > TITLE_MAX) {
    throw new Error(`The title is over ${TITLE_MAX} characters — shorten it.`);
  }
  if (!key) throw new Error("Key is required.");
  if (key.length > KEY_MAX) {
    throw new Error(`The key is over ${KEY_MAX} characters — shorten it.`);
  }
  if (!/^[a-z0-9_]+$/.test(key)) {
    throw new Error(
      "The key can only carry lowercase letters, digits and underscores."
    );
  }
  if (summary.length > SUMMARY_MAX) {
    throw new Error(
      `The summary is over ${SUMMARY_MAX} characters — it is a one-liner on the card.`
    );
  }
  if (!(ROLE_FAMILIES as readonly string[]).includes(role_family)) {
    throw new Error("Invalid role family.");
  }

  const intake_defaults: Record<string, string> = {};
  for (const field of TEMPLATE_DEFAULT_FIELDS) {
    const value = String(formData.get(`default_${field.name}`) ?? "").trim();
    if (!value) continue;
    if (value.length > DEFAULT_MAX) {
      throw new Error(
        `The ${field.name.replace(/_/g, " ")} default is over ${DEFAULT_MAX} characters.`
      );
    }
    intake_defaults[field.name] = value;
  }
  // The seeds carry the family inside the defaults too — the intake's
  // role_family select reads it from there.
  intake_defaults.role_family = role_family;

  const competency_weights: Array<{ competency_key: string; weight: number }> = [];
  const rawKeys = formData.getAll("competency_key").map(String);
  for (const compKey of rawKeys) {
    const raw = String(formData.get(`weight_${compKey}`) ?? "").trim();
    if (!raw) continue;
    const weight = Math.round(Number(raw));
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new Error(`The weight for ${compKey} must be between 0 and 100.`);
    }
    if (weight === 0) continue;
    competency_weights.push({ competency_key: compKey, weight });
  }

  return { title, key, summary, role_family, intake_defaults, competency_weights };
}

/**
 * The ledger detail: key, title, and whether the key shadows a global
 * template — never the defaults' text (the standing text-probe
 * doctrine: content does not ride the trail).
 */
async function templateEventDetail(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: { key: string; title: string }
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from("executive_role_templates")
    .select("id")
    .eq("key", input.key)
    .is("organization_id", null)
    .maybeSingle<{ id: string }>();
  return {
    template_key: input.key,
    title: input.title,
    shadows_global: data != null,
  };
}

export async function createTemplateAction(
  formData: FormData
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const input = parseTemplateForm(formData);
    const supabase = await createServerSupabaseClient();

    const { data: born, error } = await supabase
      .from("executive_role_templates")
      .insert({
        organization_id: auth.organizationId,
        created_by: auth.userId,
        is_global: false,
        key: input.key,
        title: input.title,
        summary: input.summary,
        role_family: input.role_family,
        intake_defaults: input.intake_defaults,
        competency_weights: input.competency_weights,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !born) {
      if (error?.code === "23505") {
        throw new Error(
          `Your organisation already has a template with the key "${input.key}" — pick another key or edit that one.`
        );
      }
      throw new Error(
        `Failed to create template: ${error?.message ?? "nothing was saved"}`
      );
    }

    await recordExecutiveAuditEvent(supabase, {
      organizationId: auth.organizationId,
      searchId: null,
      actorId: auth.userId,
      eventType: "template_created",
      detail: await templateEventDetail(supabase, input),
    });

    revalidatePath("/app/executive-intelligence/templates");
    redirect("/app/executive-intelligence/templates");
  });
}

export async function updateTemplateAction(
  templateId: string,
  formData: FormData
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const input = parseTemplateForm(formData);
    const supabase = await createServerSupabaseClient();

    // RLS refuses global rows and other orgs' rows; the .select() makes a
    // zero-row landing LOUD instead of a silent success (§100).
    const { data: landed, error } = await supabase
      .from("executive_role_templates")
      .update({
        key: input.key,
        title: input.title,
        summary: input.summary,
        role_family: input.role_family,
        intake_defaults: input.intake_defaults,
        competency_weights: input.competency_weights,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !landed) {
      if (error?.code === "23505") {
        throw new Error(
          `Your organisation already has a template with the key "${input.key}" — pick another key.`
        );
      }
      throw new Error(
        error
          ? `Failed to update template: ${error.message}`
          : "Nothing was saved — the template does not exist, or it is a global template, which nobody edits."
      );
    }

    await recordExecutiveAuditEvent(supabase, {
      organizationId: auth.organizationId,
      searchId: null,
      actorId: auth.userId,
      eventType: "template_updated",
      detail: await templateEventDetail(supabase, input),
    });

    revalidatePath("/app/executive-intelligence/templates");
    redirect("/app/executive-intelligence/templates");
  });
}

export async function deleteTemplateAction(
  templateId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: target } = await supabase
      .from("executive_role_templates")
      .select("id, key, title, organization_id")
      .eq("id", templateId)
      .maybeSingle<{
        id: string;
        key: string;
        title: string;
        organization_id: string | null;
      }>();

    if (!target || target.organization_id == null) {
      throw new Error(
        "Nothing was deleted — the template does not exist, or it is a global template, which nobody deletes."
      );
    }

    // The searches-side FKs are ON DELETE NO ACTION — a referenced
    // template cannot go. Refuse with the count instead of letting the
    // constraint speak in Postgres.
    const { count } = await supabase
      .from("executive_searches")
      .select("id", { count: "exact", head: true })
      .eq("template_id", templateId);

    if ((count ?? 0) > 0) {
      throw new Error(
        `This template seeded ${count} executive ${count === 1 ? "search" : "searches"} — their record points at it, so it cannot be deleted.`
      );
    }

    const { data: gone, error } = await supabase
      .from("executive_role_templates")
      .delete()
      .eq("id", templateId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !gone) {
      throw new Error(
        `Failed to delete template: ${error?.message ?? "nothing was deleted"}`
      );
    }

    await recordExecutiveAuditEvent(supabase, {
      organizationId: auth.organizationId,
      searchId: null,
      actorId: auth.userId,
      eventType: "template_deleted",
      detail: { template_key: target.key, title: target.title },
    });

    revalidatePath("/app/executive-intelligence/templates");
  });
}
