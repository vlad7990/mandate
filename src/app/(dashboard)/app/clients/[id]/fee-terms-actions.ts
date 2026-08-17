"use server";

/**
 * The client's standard commercial agreement.
 *
 * Migration 049 deliberately left commercial columns off `clients`, on
 * the reasoning that terms belong to the client but amounts belong to the
 * placement. This is the terms half, and it is a separate table rather
 * than columns on `clients` for a reason that only became visible once
 * `fees:read` existed: `clients` is readable by every active role and an
 * agreement is not, and RLS is row-level, so they cannot share a row.
 *
 * The same action writes a mandate-scoped override — `fee_terms` is one
 * table with a polymorphic scope, so a mandate override is the same shape
 * pointed at a project instead of a client.
 */

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { roundMoney } from "@/lib/fees/compute";
import {
  DEFAULT_RETAINER_PLAN,
  parseFeeBasis,
  parseFeeModel,
  parseFeeTrigger,
  type InstalmentStage,
} from "@/lib/fees/types";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The fee agreement";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function numberOrNull(formData: FormData, key: string): number | null {
  const raw = str(formData, key).replace(/[^0-9.-]/g, "");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key} is not a number.`);
  return value;
}

function intOr(formData: FormData, key: string, fallback: number): number {
  const value = numberOrNull(formData, key);
  return value == null ? fallback : Math.round(value);
}

/**
 * Read the retainer stages out of the form.
 *
 * The three fields are parallel arrays because that is what a repeating
 * fieldset posts. A plan that does not sum to 100 is rejected here with a
 * sentence; the CHECK constraint in 050 would refuse it anyway, but with
 * a constraint name that means nothing to a recruiter.
 */
function readInstalmentPlan(formData: FormData): InstalmentStage[] {
  const labels = formData.getAll("stageLabel").map(String);
  const triggers = formData.getAll("stageTrigger").map(String);
  const percents = formData.getAll("stagePercent").map(String);

  const stages: InstalmentStage[] = [];

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]?.trim();
    const trigger = parseFeeTrigger(triggers[i]);
    const percent = Number(percents[i]);

    // A blank row is the user leaving the last one empty, not an error.
    if (!label && !percents[i]?.trim()) continue;

    if (!label) throw new Error("Every instalment needs a label.");
    if (!trigger) throw new Error(`"${label}" has no recognised trigger.`);
    if (!Number.isFinite(percent) || percent <= 0) {
      throw new Error(`"${label}" needs a percentage above zero.`);
    }

    stages.push({ label, trigger, percent_of_fee: percent });
  }

  if (stages.length === 0) return [];

  const total = stages.reduce((sum, s) => sum + s.percent_of_fee, 0);
  if (Math.round(total * 1e4) / 1e4 !== 100) {
    throw new Error(
      `The instalments come to ${total}% and must come to 100%.`
    );
  }

  return stages;
}

/**
 * Create or replace the agreement on a client or a mandate.
 *
 * Upserts against the partial unique index rather than checking for an
 * existing row first: two people editing the same client's terms at once
 * would otherwise both read "none" and both insert, and the second would
 * fail on the index anyway — with a worse message.
 */
export async function saveFeeTermsAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const { userId, organizationId } = await requireActionContext("mandates:write");

    const clientId = str(formData, "clientId") || null;
    const projectId = str(formData, "projectId") || null;

    // Exactly one scope. The CHECK enforces it; this makes the failure a
    // sentence rather than a constraint name.
    if (!clientId === !projectId) {
      throw new Error("Fee terms attach to either a client or a mandate, not both.");
    }

    const feeModel = parseFeeModel(formData.get("feeModel"));
    if (!feeModel) throw new Error("Choose a fee model.");

    const currency = str(formData, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error("Currency must be a three-letter code, such as USD.");
    }

    const feePercentage = numberOrNull(formData, "feePercentage");
    const fixedFeeAmount = numberOrNull(formData, "fixedFeeAmount");

    if (feeModel === "contingent" && feePercentage == null) {
      throw new Error("A contingent agreement needs a percentage.");
    }
    if (feeModel === "fixed" && fixedFeeAmount == null) {
      throw new Error("A fixed-fee agreement needs an amount.");
    }
    if (feeModel === "retained" && feePercentage == null && fixedFeeAmount == null) {
      throw new Error("A retained agreement needs either a percentage or a fixed amount.");
    }
    if (feePercentage != null && (feePercentage <= 0 || feePercentage > 100)) {
      throw new Error("The percentage must be above 0 and no more than 100.");
    }

    // A retainer must have stages and nothing else may — the CHECK in 050
    // says so, because a retainer without stages is a contingent fee under
    // a different name.
    const plan =
      feeModel === "retained"
        ? (() => {
            const stages = readInstalmentPlan(formData);
            return stages.length > 0 ? stages : DEFAULT_RETAINER_PLAN;
          })()
        : [];

    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.from("fee_terms").upsert(
      {
        organization_id: organizationId,
        client_id: clientId,
        project_id: projectId,
        fee_model: feeModel,
        fee_percentage: feeModel === "fixed" ? null : feePercentage,
        fixed_fee_amount: fixedFeeAmount == null ? null : roundMoney(fixedFeeAmount),
        currency,
        fee_basis: parseFeeBasis(formData.get("feeBasis")) ?? "total_first_year_cash",
        guarantee_days: intOr(formData, "guaranteeDays", 90),
        payment_terms_days: intOr(formData, "paymentTermsDays", 30),
        instalment_plan: plan,
        notes: str(formData, "notes") || null,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: clientId ? "client_id" : "project_id" }
    );

    if (error) throw new Error(`Could not save the agreement: ${error.message}`);

    if (clientId) revalidatePath(`/app/clients/${clientId}`);
    if (projectId) revalidatePath(`/app/projects/${projectId}`);
    revalidatePath("/app/placements");
  });
}

/**
 * Remove an agreement.
 *
 * Placements that were priced from it keep their snapshot — 050 has
 * `fee_terms_id` as ON DELETE SET NULL rather than CASCADE, so deleting
 * the agreement forgets where a fee came from but never deletes the fee.
 */
export async function deleteFeeTermsAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireActionContext("mandates:write");

    const id = str(formData, "feeTermsId");
    const clientId = str(formData, "clientId");
    const projectId = str(formData, "projectId");
    if (!id) throw new Error("Missing agreement.");

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("fee_terms").delete().eq("id", id);

    if (error) throw new Error(`Could not remove the agreement: ${error.message}`);

    if (clientId) revalidatePath(`/app/clients/${clientId}`);
    if (projectId) revalidatePath(`/app/projects/${projectId}`);
    revalidatePath("/app/placements");
  });
}
