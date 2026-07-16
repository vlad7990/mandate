"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { runAndStoreExecutiveCompanyContext } from "@/lib/ai/run-executive-company-context";
import { recordExecutiveAuditEvent } from "@/lib/executive/audit";
import type {
  ExecutiveRoleTemplateRow,
  TemplateCompetencyWeight,
} from "@/lib/executive/types";

const MAX_FIELD_LENGTH = 2000;
const SERVICE_TIERS = new Set(["standard", "premium", "enterprise"]);

/** Optional free-text intake field: trimmed, length-capped, null when empty. */
function optionalField(formData: FormData, name: string): string | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  return raw.slice(0, MAX_FIELD_LENGTH);
}

function backToForm(error: string, templateKey: string | null): never {
  const params = new URLSearchParams({ error });
  if (templateKey) params.set("template", templateKey);
  redirect(`/executive-intelligence/searches/new?${params.toString()}`);
}

export async function createExecutiveSearchAction(formData: FormData) {
  const templateKey = optionalField(formData, "template_key");

  const companyName = optionalField(formData, "company_name");
  const roleTitle = optionalField(formData, "role_title");
  if (!companyName) backToForm("Company name is required.", templateKey);
  if (!roleTitle) backToForm("Role title is required.", templateKey);

  const serviceTierRaw = String(formData.get("service_tier") ?? "standard");
  const serviceTier = SERVICE_TIERS.has(serviceTierRaw)
    ? serviceTierRaw
    : "standard";

  const isNewRoleRaw = String(formData.get("is_new_role") ?? "");
  const isNewRole =
    isNewRoleRaw === "new" ? true : isNewRoleRaw === "replacement" ? false : null;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id || profile.status !== "active") {
    backToForm("Your account is not provisioned to start an executive search.", templateKey);
  }

  // Resolve the template (if any) before insert so template_id and the
  // competency prefill ride the same request. A key can match both a global
  // row (organization_id NULL) and an org-private override — RLS returns
  // both, and the org-specific row wins.
  let template: ExecutiveRoleTemplateRow | null = null;
  if (templateKey) {
    const { data: templateRows } = await supabase
      .from("executive_role_templates")
      .select("id, organization_id, key, title, summary, role_family, intake_defaults, competency_weights")
      .eq("key", templateKey);
    const candidates = (templateRows ?? []) as ExecutiveRoleTemplateRow[];
    template =
      candidates.find((t) => t.organization_id !== null) ??
      candidates[0] ??
      null;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("executive_searches")
    .insert({
      organization_id: profile.organization_id,
      created_by: user.id,
      template_id: template?.id ?? null,
      status: "active",
      service_tier: serviceTier,
      company_name: companyName,
      industry: optionalField(formData, "industry"),
      business_model: optionalField(formData, "business_model"),
      revenue_range: optionalField(formData, "revenue_range"),
      employee_count: optionalField(formData, "employee_count"),
      funding_stage: optionalField(formData, "funding_stage"),
      ownership_structure: optionalField(formData, "ownership_structure"),
      geographic_footprint: optionalField(formData, "geographic_footprint"),
      regulatory_environment: optionalField(formData, "regulatory_environment"),
      role_title: roleTitle,
      role_family: optionalField(formData, "role_family") ?? "other",
      is_new_role: isNewRole,
      reason_for_hire: optionalField(formData, "reason_for_hire"),
      reporting_line: optionalField(formData, "reporting_line"),
      board_exposure: optionalField(formData, "board_exposure"),
      team_size: optionalField(formData, "team_size"),
      budget_scope: optionalField(formData, "budget_scope"),
      business_situation: optionalField(formData, "business_situation"),
      expected_90_day_outcomes: optionalField(formData, "expected_90_day_outcomes"),
      expected_first_year_outcomes: optionalField(formData, "expected_first_year_outcomes"),
      non_negotiables: optionalField(formData, "non_negotiables"),
      preferred_leadership_style: optionalField(formData, "preferred_leadership_style"),
      company_context: {},
      company_context_status: "generating",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    backToForm(
      insertError?.message ?? "Could not create the search. Please retry.",
      templateKey
    );
  }

  // Template competency prefill: resolve library keys → ids, then insert
  // selections with source='template'. Best-effort — a partial prefill is
  // recoverable in the UI, so failures log rather than roll back the search.
  const templateWeights: TemplateCompetencyWeight[] = Array.isArray(
    template?.competency_weights
  )
    ? template.competency_weights
    : [];
  if (template && templateWeights.length > 0) {
    const keys = templateWeights.map((w) => w.competency_key);
    const { data: comps } = await supabase
      .from("executive_competencies")
      .select("id, key")
      .in("key", keys);
    const idByKey = new Map(
      ((comps ?? []) as Array<{ id: string; key: string }>).map((c) => [c.key, c.id])
    );
    const rows = templateWeights.flatMap((w) => {
      const competencyId = idByKey.get(w.competency_key);
      if (!competencyId) return [];
      return [
        {
          search_id: inserted.id,
          organization_id: profile.organization_id,
          competency_id: competencyId,
          weight: Math.min(100, Math.max(0, Math.round(w.weight))),
          rationale: w.rationale ?? "",
          source: "template",
        },
      ];
    });
    if (rows.length > 0) {
      const { error: prefillError } = await supabase
        .from("executive_search_competencies")
        .insert(rows);
      if (prefillError) {
        console.error(
          "[executive-search] template competency prefill failed:",
          prefillError.message
        );
      }
    }
  }

  await recordExecutiveAuditEvent(supabase, {
    organizationId: profile.organization_id,
    searchId: inserted.id,
    actorId: user.id,
    eventType: "search_created",
    detail: {
      role_title: roleTitle,
      company_name: companyName,
      template_key: template?.key ?? null,
      service_tier: serviceTier,
    },
  });

  // Company Context Agent runs after the response so the user lands on the
  // search workspace instantly; the page polls context status.
  after(async () => {
    try {
      await runAndStoreExecutiveCompanyContext(inserted.id);
    } catch (err) {
      console.error(
        "[executive-company-context] failed for search",
        inserted.id,
        err
      );
    }
  });

  redirect(`/executive-intelligence/searches/${inserted.id}`);
}

/**
 * Retry a failed (or missing) company-context generation from the search
 * workspace. Sets status back to generating and re-fires the agent.
 */
export async function regenerateCompanyContextAction(
  searchId: string
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");

  const { data, error } = await supabase
    .from("executive_searches")
    .update({
      company_context_status: "generating",
      company_context_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", searchId)
    // Never restart over an in-flight generation.
    .neq("company_context_status", "generating")
    .select("id, organization_id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to restart company research: ${error.message}`);
  }
  if (!data) {
    // Already generating (or not visible) — treat as success; polling
    // will surface whatever lands.
    return;
  }

  await recordExecutiveAuditEvent(supabase, {
    organizationId: data.organization_id,
    searchId,
    actorId: user.id,
    eventType: "search_updated",
    detail: { action: "company_context_regenerate" },
  });

  after(async () => {
    try {
      await runAndStoreExecutiveCompanyContext(searchId);
    } catch (err) {
      console.error(
        "[executive-company-context] retry failed for search",
        searchId,
        err
      );
    }
  });

  revalidatePath(`/executive-intelligence/searches/${searchId}`);
}
