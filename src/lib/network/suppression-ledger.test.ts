import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * §208 — suppression becomes a ledger, and a lift travels (154 + 155).
 *
 * The defect: both carries implemented "the earlier suppression wins" by
 * OVERWRITING the destination's whole dnc quadruple, so a person who asked a
 * recruiter to stop contacting them in March, merged in April with somebody
 * suppressed in January, lost their own reason, date and recruiter. The
 * product could no longer say why they were suppressed — it said why the
 * other person was. Lifting could not be made to travel over that model
 * without un-suppressing people who had asked for themselves.
 *
 * Structural guards. Drive 141 proved the behaviour in production.
 */

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");

function sql(file: string): string {
  return fs
    .readFileSync(path.join(MIGRATIONS, file), "utf8")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

function latestDefining(fn: string): string {
  const needle = `CREATE OR REPLACE FUNCTION public.${fn}(`;
  const file = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => sql(f).includes(needle))
    .sort()
    .pop();
  expect(file, `no migration defines ${fn}`).toBeDefined();
  return file!;
}

function body(fn: string): string {
  const text = sql(latestDefining(fn));
  const from = text.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  const ends = [text.indexOf("\n$$;", from), text.indexOf("\n$function$;", from)]
    .filter((i) => i > -1);
  const to = ends.length ? Math.min(...ends) : -1;
  return text.slice(from, to === -1 ? undefined : to);
}

const LEDGER = sql("154_suppression_becomes_a_ledger.sql");
const REFRESH = body("refresh_network_suppression");
const REACH = body("network_suppression_reach");
const LIFT = body("lift_network_suppression");
const CLEAR = body("clear_network_dnc");
const SET = body("set_network_dnc");
const WITHDRAW = body("candidate_portal_withdraw");
const MERGE = body("merge_network_profiles");

describe("§208 D1 — the ledger, and the columns it derives", () => {
  it("keeps every reason as its own row, and lifts rather than deletes", () => {
    expect(LEDGER).toMatch(/CREATE TABLE IF NOT EXISTS public\.network_suppressions/);
    expect(LEDGER).toMatch(/carried_from\s+uuid REFERENCES public\.network_suppressions\(id\)/);
    expect(LEDGER).toMatch(/lifted_at\s+timestamptz/);
    // No DELETE anywhere in the slice: a lifted row is the record that it
    // was lifted, and deleting it would be the overwrite defect again.
    expect(LEDGER).not.toMatch(/DELETE FROM public\.network_suppressions/);
  });

  it("derives the flag from the EARLIEST unlifted reason (D3)", () => {
    expect(REFRESH).toMatch(/lifted_at IS NULL/);
    expect(REFRESH).toMatch(/ORDER BY s\.set_at ASC, s\.id ASC/);
    expect(REFRESH).toMatch(/SET dnc = true/);
    // And clears only when NOTHING stands.
    expect(REFRESH).toMatch(/ELSE[\s\S]*?SET dnc = false/);
  });

  it("derives on every write, by trigger — not at each call site", () => {
    expect(LEDGER).toMatch(
      /CREATE TRIGGER network_suppressions_refresh\s*\n\s*AFTER INSERT OR UPDATE OR DELETE ON public\.network_suppressions/
    );
    // A row that moves person (a merge) must settle BOTH sides.
    expect(LEDGER).toMatch(/OLD\.profile_id IS DISTINCT FROM NEW\.profile_id[\s\S]*?refresh_network_suppression\(OLD\.profile_id\)/);
  });

  it("is readable by the org and writable by nobody", () => {
    expect(LEDGER).toMatch(/CREATE POLICY org_network_suppressions_read[\s\S]*?FOR SELECT TO authenticated/);
    expect(LEDGER).not.toMatch(/FOR INSERT TO authenticated/);
    expect(LEDGER).not.toMatch(/FOR UPDATE TO authenticated/);
    expect(LEDGER).not.toMatch(/FOR ALL TO authenticated/);
  });
});

describe("§208 D2 — how far a lift travels", () => {
  it("reaches DOWNWARDS along lineage only — never back to the original", () => {
    expect(REACH).toMatch(/WITH RECURSIVE/);
    expect(REACH).toMatch(/JOIN tree t ON c\.carried_from = t\.id/);
    // The reverse join would walk copies back to the person they came from,
    // which is somebody else's answer.
    expect(REACH).not.toMatch(/JOIN tree t ON t\.carried_from = c\.id/);
  });

  it("counts only what still stands", () => {
    expect(REACH).toMatch(/s\.lifted_at IS NULL/);
    expect(REACH).toMatch(/c\.lifted_at IS NULL/);
  });

  it("stays founder-only, with a reason, and records each person", () => {
    expect(LIFT).toMatch(/is_current_user_founder/);
    expect(LIFT).toMatch(/the un-set must record its reason|p_reason/);
    expect(LIFT).toMatch(/network_suppression_reach\(p_suppression\)/);
    expect(LIFT).toMatch(/'network_dnc_cleared'/);
    // Each affected person gets their own line, and the line says whether
    // this one was a copy — "never silently" is what D2 asked for.
    expect(LIFT).toMatch(/'carried',\s*v_row\.suppression_id <> p_suppression/);
  });

  it("stays inside one organisation", () => {
    expect(LIFT).toMatch(/p\.organization_id = v_org/);
  });

  it("refuses when nothing stands, rather than reporting a silent success", () => {
    expect(LIFT).toMatch(/IF v_n = 0 THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it("keeps the founder's blunt instrument at its old name", () => {
    // The relationship card calls clear_network_dnc(profile, reason) and
    // does not change; it now lifts every reason standing against that
    // person, each through the one lift that travels.
    expect(CLEAR).toMatch(/lift_network_suppression\(v_id, p_reason\)/);
    expect(CLEAR).toMatch(/ORDER BY s\.set_at ASC, s\.id ASC/);
  });
});

describe("§208 — the writers record rows and write no columns", () => {
  it("the recruiter's act adds a reason instead of replacing one", () => {
    expect(SET).toMatch(/record_network_suppression\(\s*\n?\s*p_profile_id, p_reason, 'recruiter'/);
    expect(SET).not.toMatch(/UPDATE public\.network_profiles/);
  });

  it("D5 — the withdrawal aims at the person, not at a stale key", () => {
    // The defect §207 fixed in this function's sibling and left standing
    // here: matching identity_key suppressed NOBODY when the token's key had
    // drifted, silently.
    expect(WITHDRAW).toMatch(/record_network_suppression\(\s*\n?\s*v_profile, 'candidate withdrew via their portal', 'withdrawal'\)/);
    // Bound to the VALUE, not the table name: mutation testing gutted the
    // lookup to `SELECT NULL::uuid FROM ...aliases` and the loose version
    // passed happily, which is the silent miss this ruling exists to close.
    expect(WITHDRAW).toMatch(
      /SELECT al\.profile_id INTO v_profile FROM public\.network_profile_aliases al/
    );
    expect(WITHDRAW).toMatch(/v_profile := v_cand\.network_profile_id;/);
    expect(WITHDRAW).not.toMatch(/SET dnc = true/);
  });

  it("the merge MOVES the ledger and stops writing the quadruple", () => {
    expect(MERGE).toMatch(
      /UPDATE public\.network_suppressions\s*\n\s*SET profile_id = p_keep\s*\n\s*WHERE profile_id = p_discard/
    );
    expect(MERGE).not.toMatch(/dnc_reason\s*=\s*CASE WHEN v_carried/);
    expect(MERGE).not.toMatch(/dnc_set_at\s*=\s*CASE WHEN v_carried/);
  });

  it("the merge moves the rows BEFORE the delete that would cascade them", () => {
    const move = MERGE.indexOf("UPDATE public.network_suppressions");
    const del = MERGE.indexOf("DELETE FROM public.network_profiles WHERE id = p_discard");
    expect(move).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(move);
  });

  it("the merge's receipt still says whether suppression came across", () => {
    expect(MERGE).toMatch(/v_carried := coalesce\(\(SELECT public\.governing_network_suppression\(p_keep\)\) = ANY\(v_moved_sup\), false\)/);
  });
});

describe("§208 D4 — the backfill knows what it cannot know", () => {
  it("writes one row per suppressed profile, with no lineage", () => {
    expect(LEDGER).toMatch(/INSERT INTO public\.network_suppressions[\s\S]*?FROM public\.network_profiles p\s*\n\s*WHERE p\.dnc/);
    // carried_from NULL: lineage before this slice was already overwritten,
    // so pre-existing suppressions never travel. Guessing would be worse.
    expect(LEDGER).toMatch(/p\.dnc_set_by, NULL/);
  });

  it("infers the source from the two system reasons and nothing else", () => {
    expect(LEDGER).toMatch(/WHEN p\.dnc_reason = 'erasure requested via their portal' THEN 'erasure'/);
    expect(LEDGER).toMatch(/WHEN p\.dnc_reason = 'candidate withdrew via their portal' THEN 'withdrawal'/);
    expect(LEDGER).toMatch(/ELSE 'recruiter'/);
  });

  it("cannot run twice into a double suppression", () => {
    expect(LEDGER).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.network_suppressions s/);
  });
});
