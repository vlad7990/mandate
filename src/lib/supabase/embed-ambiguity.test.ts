import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * No bare PostgREST embed may sit on a table pair with more than one
 * foreign-key path.
 *
 * ## The defect this generalises
 *
 * Migrations 111/112 (the platform-agents doctrine) gave most domain
 * tables a SECOND, composite foreign key to their parents —
 * `placements_candidate_in_org (organization_id, candidate_id)` beside
 * `placements_candidate_id_fkey (candidate_id)` — so that a row can
 * never point across an org boundary. That is load-bearing and stays.
 *
 * The cost was invisible for months: PostgREST refuses to guess which
 * path an embed means. `candidates(full_name)` on `placements` stopped
 * resolving, the whole query returned an error instead of rows, and
 * the call sites read `data ?? []` — so the page rendered as if the
 * table were EMPTY. Drive 110 found the first one by accident:
 * `/app/placements` was showing the SAMPLE workspace on top of a real
 * placement, because the real query had been failing silently. A
 * second sweep found the OKR financial rollup doing the same thing,
 * reporting zero billings against a mandate-scoped key result.
 *
 * Both were data that quietly read as nothing. That is the worst
 * failure shape this product has: not an error, not a refusal, just an
 * empty screen that looks like the truth.
 *
 * ## Why the check is structural rather than a list of fixed sites
 *
 * Naming the two that were found leaves the third. Every new embed
 * written against a twinned table has the same defect available to it,
 * and it will render as "no data" rather than as a crash. So this
 * walks the source instead — the same shape as `routes.test.ts` and
 * `call-sites.test.ts`, both of which exist because a list would have
 * gone stale.
 *
 * ## Two things that are NOT disambiguation
 *
 * `!inner` and `!left` are JOIN-TYPE modifiers. They read like a hint
 * and are not one: `placements!inner(project_id)` on an ambiguous pair
 * is still ambiguous, which is exactly how the OKR rollup slipped past
 * a first reading of the code. Only an FK constraint name or a column
 * disambiguates.
 *
 * ## Keeping the pair list true
 *
 * `AMBIGUOUS_PAIRS` is a snapshot of the live schema, pinned here the
 * way the model-map tripwire pins the ruled mapping. Regenerate it
 * after any migration that adds a foreign key:
 *
 *   WITH fks AS (
 *     SELECT conrelid::regclass::text AS from_table,
 *            confrelid::regclass::text AS to_table
 *       FROM pg_constraint
 *      WHERE contype = 'f' AND connamespace = 'public'::regnamespace)
 *   SELECT from_table, to_table FROM fks
 *    GROUP BY from_table, to_table HAVING count(*) > 1
 *    ORDER BY from_table, to_table;
 *
 * A pair that is missing here is a defect this test cannot see, which
 * is why the regeneration line belongs in the migration checklist and
 * not in somebody's memory.
 */

const AMBIGUOUS_PAIRS = `
activity_events:candidates activity_events:clients activity_events:placements activity_events:projects
activity_events:users boolean_queries:projects calibration_history:feedback calibration_history:projects
candidate_notes:candidates candidate_notes:projects candidate_notifications:candidates
candidate_notifications:projects candidate_outreach:candidates candidate_outreach:projects
candidate_scores:candidates candidate_scores:projects candidates:projects client_contacts:clients
client_interviews:users client_notes:client_contacts client_notes:clients executive_assessments:candidates
executive_assessments:executive_interview_plans executive_assessments:executive_searches
executive_assessments:users executive_audit_events:executive_assessments
executive_audit_events:executive_interview_plans executive_audit_events:executive_risk_reviews
executive_audit_events:executive_searches executive_audit_events:role_success_profiles
executive_interview_plans:candidates executive_interview_plans:executive_searches
executive_interview_plans:role_success_profiles executive_interview_plans:users
executive_risk_reviews:candidates executive_risk_reviews:executive_assessments
executive_risk_reviews:executive_interview_plans executive_risk_reviews:executive_searches
executive_risk_reviews:role_success_profiles executive_risk_reviews:users
executive_search_candidates:candidates executive_search_candidates:executive_searches
executive_search_competencies:executive_competencies executive_search_competencies:executive_searches
executive_searches:clients executive_searches:executive_role_templates fee_terms:clients fee_terms:projects
feedback:candidates feedback:projects hiring_manager_reviews:hiring_manager_tokens
hiring_manager_reviews:projects hiring_manager_tokens:client_contacts hiring_manager_tokens:projects
interview_plans:users invitations:users job_specs:projects mandate_grants:users objectives:users
outreach_strategies:users placement_fee_lines:placement_fee_lines placement_fee_lines:placement_fees
placement_fee_lines:placements placement_fees:fee_terms placement_fees:placements placements:candidates
placements:client_contacts placements:clients placements:projects placements:users project_reports:projects
projects:clients projects:users role_success_profiles:executive_searches role_success_profiles:users
shortlists:projects shortlists:users skills:clients skills:projects sourcing_run_candidates:candidates
sourcing_run_candidates:sourcing_runs sourcing_run_results:candidates sourcing_run_results:sourcing_runs
sourcing_runs:projects sourcing_runs:sourcing_runs sourcing_runs:users staff_invitations:users tasks:users
`
  .split(/\s+/)
  .filter(Boolean);

const AMBIGUOUS = new Set(AMBIGUOUS_PAIRS);

const SRC = path.resolve(__dirname, "../..");

/** Join-type modifiers, which read like FK hints and are not. */
const JOIN_MODIFIERS = new Set(["inner", "left"]);

/** Identifiers that are followed by `(` inside a select but are not embeds. */
const NOT_EMBEDS = new Set(["count", "select", "eq", "returns", "String", "Number"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

type Embed = {
  file: string;
  line: number;
  from: string;
  target: string;
  disambiguated: boolean;
};

/**
 * Every `.from(table)…​.select(…)` embed in the tree.
 *
 * Deliberately crude: it reads the text after a `.from()` up to the
 * next one and pulls `identifier(` out of the select argument. It only
 * has to be good enough to see the shape, and the control assertion
 * below fails if it ever stops seeing embeds at all.
 */
function embeds(): Embed[] {
  const found: Embed[] = [];

  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, "utf8");

    for (const m of text.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)/g)) {
      const from = m[1];
      const start = (m.index ?? 0) + m[0].length;
      let tail = text.slice(start, start + 1200);
      const next = tail.indexOf(".from(");
      if (next !== -1) tail = tail.slice(0, next);

      // `[\s\S]` rather than the `s` flag: the tsconfig target predates it.
      const select = /\.select\(\s*((?:[^;])*?)\)\s*(?:\.|;|$)/.exec(tail);
      if (!select) continue;

      for (const e of select[1].matchAll(/([A-Za-z_]\w*)\s*(![\w!]*)?\s*\(/g)) {
        const target = e[1];
        if (NOT_EMBEDS.has(target)) continue;

        const hints = (e[2] ?? "")
          .split("!")
          .map((h) => h.trim())
          .filter(Boolean);
        // A hint disambiguates only if it is something other than a
        // join-type modifier.
        const disambiguated = hints.some((h) => !JOIN_MODIFIERS.has(h));

        found.push({
          file: path.relative(SRC, file),
          line: text.slice(0, m.index ?? 0).split("\n").length,
          from,
          target,
          disambiguated,
        });
      }
    }
  }

  return found;
}

const ALL = embeds();

describe("PostgREST embed ambiguity", () => {
  it("still sees embeds at all", () => {
    // Guards against the scan matching nothing, which would make the
    // assertion below pass vacuously — the same control the sample-route
    // and call-site sweeps carry.
    expect(ALL.length).toBeGreaterThan(15);
    expect(ALL.some((e) => e.disambiguated)).toBe(true);
  });

  it("names the foreign key on every embed that has more than one path", () => {
    const offenders = ALL.filter(
      (e) => AMBIGUOUS.has(`${e.from}:${e.target}`) && !e.disambiguated
    ).map((e) => `${e.file}:${e.line} — ${e.from} → ${e.target}`);

    expect(offenders).toEqual([]);
  });

  it("does not accept a join-type modifier as disambiguation", () => {
    // The OKR rollup read `placements!inner(project_id)` and looked
    // named. It was not, and it returned nothing for months.
    const modifierOnly = (hint: string) =>
      hint
        .split("!")
        .map((h) => h.trim())
        .filter(Boolean)
        .some((h) => !JOIN_MODIFIERS.has(h));

    expect(modifierOnly("!inner")).toBe(false);
    expect(modifierOnly("!left")).toBe(false);
    expect(modifierOnly("!placements_candidate_id_fkey")).toBe(true);
    expect(modifierOnly("!placement_fee_lines_placement_id_fkey!inner")).toBe(true);
  });
});
