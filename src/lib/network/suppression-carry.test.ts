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
  const file = latestDefining(fn);
  const text = sql(file);
  const from = text.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  const to = text.indexOf("COMMENT ON FUNCTION", from);
  return text.slice(from, to === -1 ? undefined : to);
}

const CARRY = body("carry_network_suppression");
const TRIGGER = body("candidates_link_network_profile");

describe("§207 — the carry itself", () => {
  it("can only ever raise: no branch writes dnc false or clears the reason", () => {
    // Monotone is the whole rule. A carry that could lower a suppression
    // would be a worse defect than the one it fixes.
    expect(CARRY).toMatch(/SET\s+dnc\s*=\s*true/);
    expect(CARRY).not.toMatch(/dnc\s*=\s*false/);
    expect(CARRY).not.toMatch(/dnc_reason\s*=\s*NULL/i);
  });

  it("returns without writing when the source is not suppressed", () => {
    expect(CARRY).toMatch(/IF NOT FOUND OR NOT v_from\.dnc THEN\s*\n\s*RETURN false;/);
  });

  it("carries the ORIGINAL reason, when and who — never a fresh stamp", () => {
    // A suppression wearing today's date and nobody's name has lost the two
    // facts that make it answerable.
    expect(CARRY).toMatch(/dnc_reason\s*=\s*v_from\.dnc_reason/);
    expect(CARRY).toMatch(/dnc_set_at\s*=\s*v_from\.dnc_set_at/);
    expect(CARRY).toMatch(/dnc_set_by\s*=\s*v_from\.dnc_set_by/);
    // The two ways to restamp it, both absent.
    expect(CARRY).not.toMatch(/dnc_set_at\s*=\s*now\(\)/);
    expect(CARRY).not.toMatch(/dnc_set_by\s*=\s*\(SELECT auth\.uid\(\)\)/);
  });

  it("keeps the destination's own suppression when it came first", () => {
    expect(CARRY).toMatch(
      /IF v_to\.dnc[\s\S]*?v_from\.dnc_set_at\s*<\s*v_to\.dnc_set_at[\s\S]*?RETURN false;/
    );
  });

  it("refuses to cross an organisation", () => {
    expect(CARRY).toMatch(
      /v_to\.organization_id IS DISTINCT FROM v_from\.organization_id[\s\S]*?RETURN false;/
    );
  });

  it("opens the DNC guard's own door, the way set_network_dnc does", () => {
    // Without this the write is refused by guard_network_dnc and the carry
    // would fail every time — loudly, but in the hottest trigger there is.
    expect(CARRY).toMatch(/set_config\('mandate\.allow_dnc_write',\s*'on',\s*true\)/);
  });

  it("moves the relationship into do_not_contact with the flag", () => {
    expect(CARRY).toMatch(/relationship_state\s*=\s*'do_not_contact'/);
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
