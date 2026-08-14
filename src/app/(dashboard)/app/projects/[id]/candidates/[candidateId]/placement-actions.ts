"use server";

/**
 * Recording a placement, and the money it earns.
 *
 * The placement is written from the candidate's own page because that is
 * where a recruiter is standing when the offer lands — not from a
 * separate "placements" section they would have to remember to visit.
 * The revenue screen reads what these actions write.
 *
 * Every action here takes `mandates:write`, including the ones that only
 * touch fees. See the note on `fees:read` in `src/lib/auth/roles.ts`:
 * recording what a placement paid is part of running the mandate, so the
 * write tier is the mandate tier and there is no separate fee-write
 * capability. RLS in migration 050 says the same thing, and RLS is the
 * boundary — these checks exist so the product refuses before the
 * database has to.
 */

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { contactLabel } from "@/lib/clients/contacts";
import {
  expandFeeLines,
  dueDate,
  feeBasisAmount,
  resolveTerms,
  roundMoney,
  totalFee,
  type ResolvedTerms,
} from "@/lib/fees/compute";
import {
  FEE_TERMS_COLUMNS,
  parseFeeBasis,
  parseFeeModel,
  parsePlacementStatus,
  type FeeTermsRow,
  type PlacementStatus,
} from "@/lib/fees/types";

/** Today, as the calendar date the database would agree with. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** A date field, or null. Empty strings from an untouched `<input type="date">`. */
function dateOrNull(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} is not a date.`);
  }
  return value;
}

/**
 * A money field, or null.
 *
 * Strips the separators a person types — "250,000" and "£250,000" both
 * mean the same thing, and rejecting them teaches the user to distrust
 * the form rather than teaching them the format.
 */
function moneyOrNull(formData: FormData, key: string): number | null {
  const raw = str(formData, key).replace(/[^0-9.-]/g, "");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} is not an amount.`);
  }
  return roundMoney(value);
}

function revalidate(projectId: string, candidateId: string) {
  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/app/placements");
}

/**
 * The terms in force for a mandate — its override, else its client's
 * agreement, else null.
 *
 * Reads both rows in one round trip rather than two sequential lookups.
 * A caller without `fees:read` gets nothing back from either, which is
 * correct: they cannot see the agreement, and the placement they record
 * falls back to `manual`.
 */
async function loadTerms(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  projectId: string,
  clientId: string | null
): Promise<ResolvedTerms | null> {
  const scopes = [`project_id.eq.${projectId}`];
  if (clientId) scopes.push(`client_id.eq.${clientId}`);

  const { data } = await supabase
    .from("fee_terms")
    .select(FEE_TERMS_COLUMNS)
    .or(scopes.join(","))
    .returns<FeeTermsRow[]>();

  const rows = data ?? [];
  const mandate = rows.find((r) => r.project_id === projectId) ?? null;
  const client = rows.find((r) => r.client_id != null && r.client_id === clientId) ?? null;

  return resolveTerms(client, mandate);
}

/**
 * Record an offer.
 *
 * Creates the placement and, if the package is known, its fee. The fee is
 * optional at this point on purpose — an offer often goes out before the
 * package is finalised, and refusing to record the offer until someone
 * types a salary would mean the offer is not recorded at all.
 */
export async function recordPlacementAction(formData: FormData): Promise<void> {
  const { userId, organizationId } = await requireActionContext("mandates:write");

  const projectId = str(formData, "projectId");
  const candidateId = str(formData, "candidateId");
  if (!projectId || !candidateId) throw new Error("Missing mandate or candidate.");

  const offerDate = dateOrNull(formData, "offerDate") ?? today();

  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, client_id")
    .eq("id", projectId)
    .single<{ id: string; client_id: string | null }>();

  if (projectError || !project) throw new Error("Mandate not found.");

  const terms = await loadTerms(supabase, projectId, project.client_id);

  const { data: placement, error } = await supabase
    .from("placements")
    .insert({
      organization_id: organizationId,
      project_id: projectId,
      candidate_id: candidateId,
      client_id: project.client_id,
      status: "offered" satisfies PlacementStatus,
      offer_date: offerDate,
      // Snapshotted from the agreement now rather than read through later,
      // so changing the client's standard guarantee next year does not
      // silently re-date this placement's guarantee.
      guarantee_days: terms?.guarantee_days ?? null,
      owner_user_id: str(formData, "ownerUserId") || userId,
      sourced_by_user_id: str(formData, "sourcedByUserId") || null,
      notes: str(formData, "notes") || null,
      created_by: userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    // The unique index is the one a person actually hits — re-recording an
    // offer for a candidate who already has one on this mandate.
    if (error.code === "23505") {
      throw new Error("This candidate already has a placement on this mandate.");
    }
    throw new Error(`Could not record the placement: ${error.message}`);
  }

  const baseSalary = moneyOrNull(formData, "baseSalary");
  if (baseSalary != null) {
    await writeFee(supabase, {
      organizationId,
      userId,
      placementId: placement.id,
      terms,
      pkg: {
        base_salary: baseSalary,
        guaranteed_bonus: moneyOrNull(formData, "guaranteedBonus"),
        other_cash: moneyOrNull(formData, "otherCash"),
      },
      overrides: {
        feeModel: parseFeeModel(formData.get("feeModel")),
        feePercentage: moneyOrNull(formData, "feePercentage"),
        totalFee: moneyOrNull(formData, "totalFeeAmount"),
        currency: str(formData, "currency") || null,
        fxRate: moneyOrNull(formData, "fxRate"),
      },
    });
  }

  revalidate(projectId, candidateId);
}

type FeeInput = {
  organizationId: string;
  userId: string;
  placementId: string;
  terms: ResolvedTerms | null;
  pkg: { base_salary: number | null; guaranteed_bonus: number | null; other_cash: number | null };
  overrides: {
    feeModel: ReturnType<typeof parseFeeModel>;
    feePercentage: number | null;
    totalFee: number | null;
    currency: string | null;
    fxRate: number | null;
  };
};

/**
 * Write (or rewrite) a placement's fee and expand it into ledger lines.
 *
 * Deletes and re-creates the lines rather than diffing them, because the
 * only lines this touches are `pending` — anything already earned is
 * history and is left alone. That is checked below rather than assumed;
 * rewriting a fee after an instalment has been billed would make the
 * ledger disagree with an invoice that has already gone out.
 */
async function writeFee(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: FeeInput
): Promise<void> {
  const { organizationId, userId, placementId, terms, pkg, overrides } = input;

  const { data: org } = await supabase
    .from("organizations")
    .select("base_currency")
    .eq("id", organizationId)
    .single<{ base_currency: string }>();

  const baseCurrency = org?.base_currency ?? "USD";

  const feeModel = overrides.feeModel ?? terms?.fee_model ?? "contingent";
  const feePercentage = overrides.feePercentage ?? terms?.fee_percentage ?? null;
  const feeBasis = parseFeeBasis(terms?.fee_basis) ?? "total_first_year_cash";
  const currency = overrides.currency ?? terms?.currency ?? baseCurrency;

  // Same currency must mean a rate of 1 — the CHECK in 050 refuses
  // anything else, and a form that submits a stale rate after the user
  // switched the currency back would otherwise fail at the database.
  const fxRate = currency === baseCurrency ? 1 : (overrides.fxRate ?? 1);

  const computed = totalFee(
    {
      fee_model: feeModel,
      fee_percentage: feePercentage,
      fixed_fee_amount: terms?.fixed_fee_amount ?? null,
      fee_basis: feeBasis,
    },
    pkg
  );

  // An explicitly typed total wins over the computed one: a negotiated fee
  // is often not exactly percentage x basis, and the number that was
  // agreed is the number that gets billed.
  const total = overrides.totalFee ?? computed;
  if (total == null) return;

  const basisAmount = feeBasisAmount(pkg, feeBasis);

  const { data: fee, error: feeError } = await supabase
    .from("placement_fees")
    .upsert(
      {
        organization_id: organizationId,
        placement_id: placementId,
        fee_model: feeModel,
        fee_percentage: feeModel === "fixed" ? null : feePercentage,
        fee_basis: feeBasis,
        payment_terms_days: terms?.payment_terms_days ?? 30,
        terms_source: terms?.source ?? "manual",
        fee_terms_id: terms?.fee_terms_id ?? null,
        currency,
        base_salary: pkg.base_salary,
        guaranteed_bonus: pkg.guaranteed_bonus,
        other_cash: pkg.other_cash,
        fee_basis_amount: basisAmount > 0 ? basisAmount : null,
        total_fee_amount: total,
        base_currency: baseCurrency,
        fx_rate: fxRate,
        fx_rate_fixed_on: today(),
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "placement_id" }
    )
    .select("id")
    .single<{ id: string }>();

  if (feeError || !fee) {
    throw new Error(`Could not save the fee: ${feeError?.message ?? "unknown error"}`);
  }

  const { count: earnedCount } = await supabase
    .from("placement_fee_lines")
    .select("id", { count: "exact", head: true })
    .eq("placement_fee_id", fee.id)
    .eq("status", "earned");

  // Something has already been billed against this fee. Leave the ledger
  // exactly as it is; the header now reflects the new terms and the
  // difference is visible on the placement rather than silently applied.
  if ((earnedCount ?? 0) > 0) return;

  await supabase.from("placement_fee_lines").delete().eq("placement_fee_id", fee.id);

  const lines = expandFeeLines(
    { fee_model: feeModel, instalment_plan: terms?.instalment_plan ?? [] },
    total
  );

  const { error: linesError } = await supabase.from("placement_fee_lines").insert(
    lines.map((line) => ({
      organization_id: organizationId,
      placement_id: placementId,
      placement_fee_id: fee.id,
      kind: line.kind,
      label: line.label,
      sequence: line.sequence,
      trigger: line.trigger,
      amount: line.amount,
      currency,
      base_currency: baseCurrency,
      fx_rate: fxRate,
      status: line.status,
      created_by: userId,
    }))
  );

  if (linesError) {
    throw new Error(`Could not write the fee schedule: ${linesError.message}`);
  }
}

/**
 * Save or replace the fee on an existing placement.
 *
 * Separate from recording the placement because the package usually
 * arrives after the offer does.
 */
export async function savePlacementFeeAction(formData: FormData): Promise<void> {
  const { userId, organizationId } = await requireActionContext("mandates:write");

  const placementId = str(formData, "placementId");
  const projectId = str(formData, "projectId");
  const candidateId = str(formData, "candidateId");
  if (!placementId) throw new Error("Missing placement.");

  const supabase = await createServerSupabaseClient();

  const { data: placement, error } = await supabase
    .from("placements")
    .select("id, project_id, client_id")
    .eq("id", placementId)
    .single<{ id: string; project_id: string; client_id: string | null }>();

  if (error || !placement) throw new Error("Placement not found.");

  const terms = await loadTerms(supabase, placement.project_id, placement.client_id);

  await writeFee(supabase, {
    organizationId,
    userId,
    placementId,
    terms,
    pkg: {
      base_salary: moneyOrNull(formData, "baseSalary"),
      guaranteed_bonus: moneyOrNull(formData, "guaranteedBonus"),
      other_cash: moneyOrNull(formData, "otherCash"),
    },
    overrides: {
      feeModel: parseFeeModel(formData.get("feeModel")),
      feePercentage: moneyOrNull(formData, "feePercentage"),
      totalFee: moneyOrNull(formData, "totalFeeAmount"),
      currency: str(formData, "currency") || null,
      fxRate: moneyOrNull(formData, "fxRate"),
    },
  });

  revalidate(projectId, candidateId);
}

/**
 * Move a placement's status, and carry the ledger with it.
 *
 * The three transitions that mean something to the money:
 *
 * - **accepted** earns any instalment triggered by `offer_accepted`.
 * - **started** earns anything triggered by `start_date`, and stamps the
 *   guarantee window from the start date.
 * - **fell_through** cancels what is still pending and, if asked, books a
 *   reversal against everything already earned.
 *
 * Earning is done here rather than by a scheduled job because there is no
 * scheduler in this project — see the note in 050. The trigger vocabulary
 * that has no status behind it (`engagement`, `shortlist`,
 * `guarantee_passed`) is earned by hand from the placement panel.
 */
export async function updatePlacementStatusAction(formData: FormData): Promise<void> {
  const { userId, organizationId } = await requireActionContext("mandates:write");

  const placementId = str(formData, "placementId");
  const projectId = str(formData, "projectId");
  const candidateId = str(formData, "candidateId");
  const status = parsePlacementStatus(formData.get("status"));

  if (!placementId) throw new Error("Missing placement.");
  if (!status) throw new Error("Unrecognised placement status.");

  const supabase = await createServerSupabaseClient();

  const { data: placement, error: loadError } = await supabase
    .from("placements")
    .select("id, status, offer_date, accepted_date, start_date, guarantee_days, guarantee_ends_on")
    .eq("id", placementId)
    .single<{
      id: string;
      status: PlacementStatus;
      offer_date: string;
      accepted_date: string | null;
      start_date: string | null;
      guarantee_days: number | null;
      guarantee_ends_on: string | null;
    }>();

  if (loadError || !placement) throw new Error("Placement not found.");

  const when = dateOrNull(formData, "effectiveDate") ?? today();

  // Each status needs the date that got it there — the CHECK in 050
  // refuses the row otherwise, and refusing here first means the user
  // sees a sentence rather than a constraint name.
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "declined") patch.declined_date = when;
  if (status === "accepted") patch.accepted_date = when;
  if (status === "started") {
    patch.start_date = when;
    patch.accepted_date = placement.accepted_date ?? when;
  }
  if (status === "fell_through") {
    patch.fell_through_date = when;
    patch.fell_through_reason = str(formData, "reason") || null;
  }

  const { error: updateError } = await supabase
    .from("placements")
    .update(patch)
    .eq("id", placementId);

  if (updateError) {
    throw new Error(`Could not update the placement: ${updateError.message}`);
  }

  if (status === "accepted" || status === "started") {
    await earnLinesForTrigger(
      supabase,
      placementId,
      status === "accepted" ? "offer_accepted" : "start_date",
      when
    );
  }

  if (status === "fell_through") {
    await unwindFee(supabase, {
      organizationId,
      userId,
      placementId,
      on: when,
      reason: str(formData, "reason") || "Placement fell through",
      clawBack: str(formData, "clawBack") === "on",
    });
  }

  revalidate(projectId, candidateId);
}

/** Earn every pending line waiting on `trigger`, dated `on`. */
async function earnLinesForTrigger(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  placementId: string,
  trigger: string,
  on: string
): Promise<void> {
  const { data: fee } = await supabase
    .from("placement_fees")
    .select("id, payment_terms_days")
    .eq("placement_id", placementId)
    .maybeSingle<{ id: string; payment_terms_days: number }>();

  if (!fee) return;

  await supabase
    .from("placement_fee_lines")
    .update({
      status: "earned",
      earned_on: on,
      due_on: dueDate(on, fee.payment_terms_days),
      updated_at: new Date().toISOString(),
    })
    .eq("placement_id", placementId)
    .eq("status", "pending")
    .eq("trigger", trigger);
}

/**
 * Unwind a fee when the placement falls through.
 *
 * Pending lines are cancelled — they were never billed and never will be.
 * Earned lines are reversed with a negative line dated when the
 * fallthrough happened, never by editing the original. That is the whole
 * reason the ledger is a ledger: the quarter that billed the fee still
 * reports having billed it, and the clawback lands in the quarter it
 * actually happened, so a report run in March does not change in June.
 *
 * `clawBack` is the recruiter's call rather than an automatic consequence
 * of the guarantee dates. A fallthrough outside the guarantee period owes
 * nothing back, and even inside it the client may have agreed to a
 * replacement instead — which is a negotiation the product should record,
 * not predict.
 */
async function unwindFee(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: {
    organizationId: string;
    userId: string;
    placementId: string;
    on: string;
    reason: string;
    clawBack: boolean;
  }
): Promise<void> {
  const { organizationId, userId, placementId, on, reason, clawBack } = input;

  await supabase
    .from("placement_fee_lines")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("placement_id", placementId)
    .eq("status", "pending");

  if (!clawBack) return;

  const { data: earned } = await supabase
    .from("placement_fee_lines")
    .select("id, placement_fee_id, label, amount, currency, base_currency, fx_rate")
    .eq("placement_id", placementId)
    .eq("status", "earned")
    .eq("kind", "instalment")
    .returns<
      Array<{
        id: string;
        placement_fee_id: string;
        label: string;
        amount: number;
        currency: string;
        base_currency: string;
        fx_rate: number;
      }>
    >();

  if (!earned?.length) return;

  // Reversed at the rate the original was booked at, not today's. The
  // clawback of a fee is the same money going back — introducing a new
  // rate here would leave an FX gain or loss the product never earned.
  await supabase.from("placement_fee_lines").insert(
    earned.map((line, index) => ({
      organization_id: organizationId,
      placement_id: placementId,
      placement_fee_id: line.placement_fee_id,
      kind: "reversal",
      label: `Reversal — ${line.label}`,
      sequence: 100 + index,
      trigger: null,
      amount: -Math.abs(line.amount),
      currency: line.currency,
      base_currency: line.base_currency,
      fx_rate: line.fx_rate,
      status: "earned",
      earned_on: on,
      reason,
      reverses_line_id: line.id,
      created_by: userId,
    }))
  );
}

/**
 * Record who on the client's side signed the placement off.
 *
 * Writes both columns together: the FK so the client screen can join, and
 * the label so the answer survives the contact being deleted. 054 makes the
 * FK `ON DELETE SET NULL` precisely so that deleting a person cannot erase
 * who authorised a booked fee.
 *
 * The label is derived from the contact rather than taken from the form
 * when a contact is chosen, so the two cannot disagree. When no contact is
 * chosen the typed name is kept on its own — knowing the name on the offer
 * letter should not be blocked on somebody first creating a CRM record.
 *
 * Takes `mandates:write` like everything else here, and is on the placement
 * rather than the fee, so a researcher who can see the placement can also
 * see who signed it off. See §10 of the handoff for that line.
 */
export async function setPlacementSignOffAction(formData: FormData): Promise<void> {
  await requireActionContext("mandates:write");

  const placementId = str(formData, "placementId");
  const projectId = str(formData, "projectId");
  const candidateId = str(formData, "candidateId");
  if (!placementId) throw new Error("Missing placement.");

  const supabase = await createServerSupabaseClient();

  const { data: placement, error: loadError } = await supabase
    .from("placements")
    .select("id, client_id")
    .eq("id", placementId)
    .single<{ id: string; client_id: string | null }>();

  if (loadError || !placement) throw new Error("Placement not found.");

  const contactId = str(formData, "contactId") || null;
  let label = str(formData, "signedOffByLabel") || null;

  if (contactId) {
    // Checked against the placement's own client, not merely against the
    // org: RLS scopes contacts by organisation, so "this contact works at
    // the client we placed into" is a check only the application makes.
    const { data: contact } = await supabase
      .from("client_contacts")
      .select("id, full_name, title, client_id")
      .eq("id", contactId)
      .maybeSingle<{
        id: string;
        full_name: string;
        title: string | null;
        client_id: string;
      }>();

    if (!contact) throw new Error("Contact not found.");
    if (!placement.client_id || contact.client_id !== placement.client_id) {
      throw new Error("That contact is not at this placement's client.");
    }

    label = contactLabel(contact);
  }

  const { error } = await supabase
    .from("placements")
    .update({
      signed_off_by_contact_id: contactId,
      signed_off_by_label: label,
      updated_at: new Date().toISOString(),
    })
    .eq("id", placementId);

  if (error) throw new Error(`Could not record the sign-off: ${error.message}`);

  revalidate(projectId, candidateId);
}

/**
 * Mark one instalment earned, by hand.
 *
 * The triggers with no status behind them — an engagement fee, a
 * shortlist instalment, a guarantee expiry — are earned from the
 * placement panel, because nothing in the pipeline model marks them and
 * nothing is scheduled to notice.
 */
export async function markFeeLineEarnedAction(formData: FormData): Promise<void> {
  await requireActionContext("mandates:write");

  const lineId = str(formData, "lineId");
  const projectId = str(formData, "projectId");
  const candidateId = str(formData, "candidateId");
  if (!lineId) throw new Error("Missing fee line.");

  const on = dateOrNull(formData, "earnedOn") ?? today();

  const supabase = await createServerSupabaseClient();

  const { data: line } = await supabase
    .from("placement_fee_lines")
    .select("id, placement_fee_id, status")
    .eq("id", lineId)
    .single<{ id: string; placement_fee_id: string; status: string }>();

  if (!line) throw new Error("Fee line not found.");
  if (line.status === "earned") return;

  const { data: fee } = await supabase
    .from("placement_fees")
    .select("payment_terms_days")
    .eq("id", line.placement_fee_id)
    .single<{ payment_terms_days: number }>();

  const { error } = await supabase
    .from("placement_fee_lines")
    .update({
      status: "earned",
      earned_on: on,
      due_on: dueDate(on, fee?.payment_terms_days ?? 30),
      updated_at: new Date().toISOString(),
    })
    .eq("id", lineId);

  if (error) throw new Error(`Could not mark the instalment earned: ${error.message}`);

  revalidate(projectId, candidateId);
}
