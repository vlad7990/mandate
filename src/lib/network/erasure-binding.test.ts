import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { describePeopleReceipt } from "@/lib/network/merge-people";

/**
 * §207 SLICE TWO — what an erasure is attached to (migration 152).
 *
 * The gate was one door asking its question of a STRING: the key the
 * PORTAL TOKEN froze when the link was issued, compared against the key
 * the candidate row computes at send time. Three ordinary things make
 * those disagree — a merge (§204 D4), an identity edit, and a record that
 * arrives later — and each one silently opened the door on somebody who
 * had asked to be forgotten.
 *
 * A request now carries the PERSON, the KEY and a FROZEN SNAPSHOT of the
 * rows it covered, and `candidate_erasure_open` ORs four arms over them.
 * Drive 140 proved the behaviour in production; these hold the shape.
 */

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");

function sqlFile(file: string): string {
  return fs
    .readFileSync(path.join(MIGRATIONS, file), "utf8")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

function src(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** The migration that currently defines a function — see §207 slice 1. */
function latestDefining(fn: string): string {
  const needle = `CREATE OR REPLACE FUNCTION public.${fn}(`;
  const file = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => sqlFile(f).includes(needle))
    .sort()
    .pop();
  expect(file, `no migration defines ${fn}`).toBeDefined();
  return file!;
}

function body(fn: string): string {
  const text = sqlFile(latestDefining(fn));
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

/** Whitespace-insensitive comparison of a SQL fragment. */
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const GATE = body("candidate_erasure_open");
const FILE_REQUEST = body("candidate_portal_request_erasure");
const MERGE = body("merge_network_profiles");
const SEND = src("src/lib/comms/send-candidate-message.ts");
const COPY = src("src/app/(dashboard)/app/candidates/network/actions.ts");
const CLOSE = src("src/app/ops/erasure-actions.ts");

describe("§207 D1 — the gate asks all four arms", () => {
  it("asks the person", () => {
    expect(GATE).toMatch(
      /r\.network_profile_id IS NOT NULL[\s\S]*?r\.network_profile_id = c\.network_profile_id/
    );
  });

  it("asks the person's PRE-MERGE names, through §203's alias", () => {
    // Asserted WHOLE, not by landmarks. Mutation testing found the loose
    // version blind: gutting the arm with an extra `AND false` left every
    // landmark in place and the guard still passed. Whitespace is
    // normalised so reformatting alone does not fail it; any added or
    // removed predicate does.
    const arm = GATE.slice(
      GATE.indexOf("OR (c.network_profile_id IS NOT NULL"),
      GATE.indexOf("OR r.identity_key =")
    );
    expect(norm(arm)).toBe(
      norm(`OR (c.network_profile_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM public.network_profile_aliases a
                WHERE a.organization_id = r.organization_id
                  AND a.profile_id = c.network_profile_id
                  AND a.identity_key = r.identity_key))`)
    );
  });

  it("asks the key the row computes today", () => {
    expect(GATE).toMatch(
      /r\.identity_key = public\.candidate_identity_key\(\s*\n?\s*c\.email, c\.linkedin_url, c\.full_name, c\.current_company\)/
    );
  });

  it("asks the rows the request froze when it was filed", () => {
    // The only arm that still answers once an identity edit has moved a row
    // to a different person AND changed the key it computes.
    expect(GATE).toMatch(/c\.id = ANY \(r\.covered_candidate_ids\)/);
  });

  it("ORs them — one arm matching is enough", () => {
    const arms = GATE.split(/\bOR\b/).length - 1;
    expect(arms).toBeGreaterThanOrEqual(3);
    expect(GATE).not.toMatch(/\bAND\s+c\.id = ANY/);
  });

  it("only counts requests nobody has closed", () => {
    expect(GATE).toMatch(/r\.resolved_at IS NULL/);
  });

  it("stays inside one organisation", () => {
    expect(GATE).toMatch(/r\.organization_id = c\.organization_id/);
  });
});

describe("§207 D1 — filing records who and what", () => {
  it("resolves the person, falling back to an alias", () => {
    expect(FILE_REQUEST).toMatch(
      /FROM public\.network_profiles np[\s\S]*?np\.identity_key = v_tok\.identity_key/
    );
    expect(FILE_REQUEST).toMatch(
      /IF v_profile IS NULL THEN[\s\S]*?FROM public\.network_profile_aliases a/
    );
  });

  it("freezes the rows the ask covered", () => {
    expect(FILE_REQUEST).toMatch(/array_agg\(c\.id\)/);
    expect(FILE_REQUEST).toMatch(
      /INSERT INTO public\.candidate_erasure_requests[\s\S]*?covered_candidate_ids/
    );
  });

  it("suppresses the PERSON it resolved, not whatever still keys that way", () => {
    // Before §207, the UPDATE matched `identity_key = token key`, so a
    // profile whose key had drifted since the link was issued was not the
    // one suppressed — and nothing said so. §208: it records a ledger row
    // against that person, and writes no column at all.
    expect(FILE_REQUEST).toMatch(
      /record_network_suppression\(\s*\n?\s*v_profile, 'erasure requested via their portal', 'erasure'\)/
    );
    expect(FILE_REQUEST).not.toMatch(/UPDATE public\.network_profiles/);
  });
});

describe("§207 D2 — a merge carries the request", () => {
  it("repoints every request about the discarded person", () => {
    expect(MERGE).toMatch(
      /UPDATE public\.candidate_erasure_requests r\s*\n\s*SET network_profile_id = p_keep\s*\n\s*WHERE r\.network_profile_id = p_discard/
    );
  });

  it("repoints BEFORE the discarded person is deleted", () => {
    const repoint = MERGE.indexOf("UPDATE public.candidate_erasure_requests");
    const del = MERGE.indexOf("DELETE FROM public.network_profiles WHERE id = p_discard");
    expect(repoint).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(repoint);
  });

  it("says so in the receipt and the trail", () => {
    expect(MERGE).toMatch(/'erasures_open',\s*v_erasures/);
    const receipt = describePeopleReceipt({
      kept_id: "p1",
      kept: "Jane Doe",
      merged_in: "J. Doe",
      candidates: 2,
      aliases_moved: 0,
      state: "do_not_contact",
      dnc_carried: true,
      erasures_open: 1,
      filled: [],
    });
    expect(receipt).toContain(
      "An open erasure request stands against this person and now covers every record."
    );
  });

  it("says nothing when there is nothing to say", () => {
    const receipt = describePeopleReceipt({
      kept_id: "p1",
      kept: "Jane Doe",
      merged_in: "J. Doe",
      candidates: 1,
      aliases_moved: 0,
      state: "cold",
      dnc_carried: false,
      erasures_open: 0,
      filled: [],
    });
    expect(receipt).not.toContain("erasure");
  });
});

describe("§207 D4 — both doors ask, and both fail closed", () => {
  it("the send ladder asks the function, not a key", () => {
    expect(SEND).toMatch(/rpc\("candidate_erasure_open"/);
    // The string comparison this replaced, gone from the file entirely.
    expect(SEND).not.toMatch(/\.eq\("identity_key"/);
    expect(SEND).not.toMatch(/identityKey\(/);
  });

  it("the §200 copy asks the same function", () => {
    expect(COPY).toMatch(/rpc\(\s*\n?\s*"candidate_erasure_open"/);
    expect(COPY).toMatch(/open erasure request/);
  });

  it("a failed read refuses, in both doors — not knowing is not permission", () => {
    expect(SEND).toMatch(/erasureQ\.error \? true :/);
    expect(COPY).toMatch(/if \(erasureErr \|\| erasureOpen === true\)/);
  });

  it("the copy door refuses BEFORE it writes anything", () => {
    const refusal = COPY.indexOf("candidate_erasure_open");
    const insert = COPY.indexOf('.from("candidates")\n      .insert(');
    expect(refusal).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(refusal);
  });
});

describe("§207 D5 — a decline is two answers", () => {
  it("refuses a decline that does not say which", () => {
    expect(CLOSE).toMatch(/outcome === "declined" && !declineKind/);
  });

  it("lifts the suppression only for not_subject", () => {
    expect(CLOSE).toMatch(/declineKind === "not_subject"/);
    expect(CLOSE).toMatch(/rpc\(\s*\n?\s*"lift_network_suppression"/);
  });

  it("lifts the row THIS request wrote — by lineage, not by fingerprint", () => {
    // §208: the row is findable. §207 had to guess from the reason text and
    // an absent setter, which also could not reach the copies a carry made.
    // A reason this person holds for themselves is a different row, and
    // lifting by id cannot touch it.
    expect(CLOSE).toMatch(/\.from\("network_suppressions"\)/);
    expect(CLOSE).toMatch(/\.eq\("source", "erasure"\)/);
    expect(CLOSE).toMatch(/\.is\("lifted_at", null\)/);
    expect(CLOSE).not.toMatch(/dnc_reason ===/);
  });

  it("never lifts anything for cannot_erase", () => {
    const lift = CLOSE.indexOf('"lift_network_suppression"');
    const guard = CLOSE.indexOf('declineKind === "not_subject"');
    expect(guard).toBeGreaterThan(-1);
    expect(lift).toBeGreaterThan(guard);
    expect(CLOSE).not.toMatch(/cannot_erase[\s\S]{0,400}lift_network_suppression/);
  });

  it("tells the operator when the lift failed, rather than closing quietly", () => {
    // Bound to the BRANCH, not the sentence: mutation testing found that
    // asserting the message alone passed happily when the throw became a
    // console.warn, which is exactly the silence this guard is about.
    const start = CLOSE.indexOf("if (clearErr)");
    const end = CLOSE.indexOf('revalidatePath("/ops")', start);
    expect(start, "the clearErr branch is gone").toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = CLOSE.slice(start, end);
    expect(branch).toMatch(/throw new Error\(/);
    expect(branch).not.toMatch(/console\./);
    expect(branch).toMatch(/could not[\s\S]*?be lifted/);
  });
});
