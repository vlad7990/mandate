import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { describeActivity } from "@/lib/activity/describe";

/**
 * §207 SLICE ONE — suppression survives a repoint (migration 151).
 *
 * The defect, measured on a scratch row before any code was written: a
 * recruiter adding somebody's email moved that candidate row to a NEWLY
 * MINTED person with `dnc = false`, leaving the suppression on a profile
 * with no rows. Since 098 an erasure request sets DNC on the person, so the
 * protection that dropped was the one standing between a person who asked
 * to be forgotten and the next outreach email.
 *
 * These guards are STRUCTURAL — they prove only what the SQL says. Drive
 * 139 proved the behaviour against production, five branches of it (the
 * carry, never-restamped, the earlier suppression winning in both
 * directions, nothing-to-carry, and fill-if-null), and the branch that
 * cannot be reached from the product at all — the cross-org refusal, which
 * `resolve_network_profile` makes unreachable — is guarded here and
 * nowhere else, which is the honest place to say so.
 */

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");

/** Comments stripped before asserting about code — §202's lesson. */
function sql(file: string): string {
  return fs
    .readFileSync(path.join(MIGRATIONS, file), "utf8")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

/**
 * The migration that CURRENTLY defines a function: the highest-numbered one
 * that redefines it. Binding to "151" would turn these into claims about
 * history the day somebody writes 160 — this keeps them claims about the
 * database.
 */
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
  // To the function's OWN terminator. Slicing to the next COMMENT worked
  // until 155 put several functions in one file with no comment between
  // them — the helper then captured the merge as well, and three guards
  // quietly started asserting about the wrong function.
  const ends = [text.indexOf("\n$$;", from), text.indexOf("\n$function$;", from)]
    .filter((i) => i > -1);
  const to = ends.length ? Math.min(...ends) : -1;
  return text.slice(from, to === -1 ? undefined : to);
}

const CARRY = body("carry_network_suppression");
const TRIGGER = body("candidates_link_network_profile");

describe("§207 — the carry itself", () => {
  it("can only ever raise: it records rows and writes no column", () => {
    // Monotone is the whole rule. §208 made it structural — the carry has no
    // UPDATE in it at all, so there is no longer any way for it to lower
    // anything even by accident. The derived columns have one writer
    // (refresh_network_suppression) and this is not it.
    expect(CARRY).toMatch(/record_network_suppression\(/);
    expect(CARRY).not.toMatch(/UPDATE public\.network_profiles/);
    expect(CARRY).not.toMatch(/dnc\s*=\s*false/);
  });

  it("returns without writing when the source is not suppressed", () => {
    expect(CARRY).toMatch(/IF NOT FOUND OR NOT v_from\.dnc THEN\s*\n\s*RETURN false;/);
  });

  it("carries the ORIGINAL reason, when and who — never a fresh stamp", () => {
    // A suppression wearing today's date and nobody's name has lost the two
    // facts that make it answerable. §208: the copy is a row that takes the
    // original's reason, set_at and set_by, and names the row it came from.
    expect(CARRY).toMatch(
      /record_network_suppression\(\s*\n?\s*p_to, v_row\.reason, 'carried', v_row\.set_by, v_row\.set_at, v_row\.id/
    );
    expect(CARRY).not.toMatch(/now\(\)/);
    expect(CARRY).not.toMatch(/auth\.uid\(\)/);
  });

  it("cannot destroy the destination's own suppression, because it adds", () => {
    // §207 compared the two and overwrote the loser — which is how a person
    // who had asked for themselves lost their own reason (§208's Part 1).
    // There is nothing left to compare: every reason is its own row and the
    // EARLIEST governs, decided in one place.
    expect(CARRY).not.toMatch(/v_to\.dnc_set_at/);
    const gov = body("refresh_network_suppression");
    expect(gov).toMatch(/ORDER BY s\.set_at ASC, s\.id ASC/);
  });

  it("refuses to cross an organisation", () => {
    expect(CARRY).toMatch(
      /v_to\.organization_id IS DISTINCT FROM v_from\.organization_id[\s\S]*?RETURN false;/
    );
  });

  it("opens the DNC guard's own door — in the ONE place that writes now", () => {
    // §208 moved the write to the derivation, so that is where the door is
    // opened. Without it guard_network_dnc refuses and every suppression in
    // the product fails.
    const refresh = body("refresh_network_suppression");
    expect(refresh).toMatch(/set_config\('mandate\.allow_dnc_write',\s*'on',\s*true\)/);
    expect(CARRY).not.toMatch(/allow_dnc_write/);
  });

  it("moves the relationship into do_not_contact with the flag", () => {
    const refresh = body("refresh_network_suppression");
    expect(refresh).toMatch(/relationship_state\s*=\s*'do_not_contact'/);
    // And back out of it only when nothing stands — 098's rule, kept.
    expect(refresh).toMatch(/WHEN p\.relationship_state = 'do_not_contact'\s*\n?\s*THEN 'cold'/);
  });

  it("records the carry in the trail", () => {
    expect(CARRY).toMatch(/'network_dnc_set'/);
    expect(CARRY).toMatch(/'source',\s*'identity_edit'/);
    expect(CARRY).toMatch(/'carried_from'/);
    // Found by mutation: `write_activity_event` returns silently when the
    // organisation is NULL (053), so an event written without one is a
    // trail line nobody will ever read and nothing would complain about.
    expect(CARRY).toMatch(/p_organization_id => v_to\.organization_id/);
  });

  it("is reachable from no session — internal to the definer paths", () => {
    const file = latestDefining("carry_network_suppression");
    expect(sql(file)).toMatch(
      /REVOKE ALL ON FUNCTION public\.carry_network_suppression\(uuid, uuid\)\s*\n?\s*FROM public, anon, authenticated;/
    );
  });
});

describe("§207 — the trigger that calls it", () => {
  it("carries only on a REAL repoint between two people", () => {
    // OLD NULL is the ruled fill-if-null case: the row is joining a person
    // for the first time and there is nothing to carry.
    expect(TRIGGER).toMatch(
      /OLD\.network_profile_id IS NOT NULL[\s\S]*?NEW\.network_profile_id IS NOT NULL[\s\S]*?IS DISTINCT FROM OLD\.network_profile_id[\s\S]*?carry_network_suppression\(\s*\n?\s*OLD\.network_profile_id, NEW\.network_profile_id\)/
    );
  });

  it("carries AFTER the resolve, never before", () => {
    const resolved = TRIGGER.indexOf("NEW.network_profile_id := public.resolve_network_profile");
    const carried = TRIGGER.indexOf("carry_network_suppression");
    expect(resolved).toBeGreaterThan(-1);
    expect(carried).toBeGreaterThan(resolved);
  });

  it("leaves §193's hold and §196/139's branch byte for byte", () => {
    // The riskiest edit in the slice: this function runs on every candidate
    // insert and every identity edit, under every principal that writes a
    // candidate. The proof that it is additive is that the earlier branches
    // are literally unchanged from the migration that ruled them.
    const prior = sql("139_no_person_before_we_know_who.sql");
    const from = prior.indexOf("BEGIN\n");
    const to =
      prior.indexOf("NEW.linkedin_url, NEW.current_company);") +
      "NEW.linkedin_url, NEW.current_company);".length;
    const ruled = prior.slice(from, to);
    expect(ruled.length).toBeGreaterThan(400);
    expect(TRIGGER).toContain(ruled);
  });
});

describe("§207 — the trail does not credit a click nobody made", () => {
  const base = {
    id: "e1",
    created_at: "2026-09-28T10:00:00Z",
    actor_label: null,
    project_id: null,
    candidate_id: null,
  };

  it("says a carried suppression was carried", () => {
    const line = describeActivity({
      ...base,
      event_type: "network_dnc_set",
      detail: {
        person: "Jane Doe",
        reason: "erasure requested via their portal",
        source: "identity_edit",
        carried_from: "Jane Doe",
      },
    } as never);
    expect(line).toBe(
      "Carried Jane Doe's do-not-contact onto their updated record — erasure requested via their portal"
    );
    expect(line).not.toContain("Marked");
  });

  it("names the person it came from when the two records disagree", () => {
    const line = describeActivity({
      ...base,
      event_type: "network_dnc_set",
      detail: {
        person: "Jane Doe",
        reason: "said no",
        source: "identity_edit",
        carried_from: "J. Doe",
      },
    } as never);
    expect(line).toContain("(from J. Doe)");
  });

  it("still reads as a decision when a recruiter made one", () => {
    const line = describeActivity({
      ...base,
      event_type: "network_dnc_set",
      detail: { person: "Jane Doe", reason: "asked us to stop", source: "recruiter" },
    } as never);
    expect(line).toBe("Marked Jane Doe do-not-contact — asked us to stop");
  });
});
