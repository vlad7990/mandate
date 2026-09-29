import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * §209 — what a merge moved (migration 157).
 *
 * Three things with one cause. §208 gave the ledger lineage for COPIES
 * (`carried_from`) and nothing for MOVES, and a merge MOVES the discarded
 * person's reasons onto the survivor:
 *
 *  · D1 — the erasure request never learned which ledger row it wrote, so
 *    the decline re-found it by (profile, source='erasure', earliest) —
 *    a FINGERPRINT under a comment claiming lineage. Right only while a
 *    profile holds one erasure row, and a merge is what makes it hold two.
 *  · D2 — nothing recorded that a reason moved, so the card could not say
 *    where a reason came from.
 *  · D4 (the founder's ruling, against the gate's recommendation) — RELAX
 *    the open-request index. Two people who had each asked to be forgotten
 *    could not be merged at all; the repoint was a duplicate key that
 *    aborted the merge whole. Proven live before the migration was written.
 *
 * Structural guards, mutation-tested. Drive 143 proved the behaviour live.
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

/** A function's own body, cut at ITS terminator — never at the next comment. */
function body(text: string, fn: string): string {
  const from = text.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(from, `${fn} not defined here`).toBeGreaterThan(-1);
  const ends = ["\n$$;", "\n$fn$;", "\n$function$;"]
    .map((t) => text.indexOf(t, from))
    .filter((i) => i > -1);
  expect(ends.length, `${fn} has no terminator`).toBeGreaterThan(0);
  return text.slice(from, Math.min(...ends));
}

const M157 = sql("157_a_request_owns_the_row_it_wrote.sql");
const FILE = body(M157, "candidate_portal_request_erasure");
const STAMP = body(M157, "network_suppressions_stamp_move");

const ACTIONS = fs.readFileSync(
  path.join(ROOT, "src", "app", "ops", "erasure-actions.ts"),
  "utf8"
);
const OPS_PAGE = fs.readFileSync(
  path.join(ROOT, "src", "app", "ops", "page.tsx"),
  "utf8"
);
const QUEUE = fs.readFileSync(
  path.join(ROOT, "src", "app", "ops", "erasure-queue.tsx"),
  "utf8"
);
const RESOLVER = fs.readFileSync(
  path.join(ROOT, "src", "lib", "network", "profile-resolver.ts"),
  "utf8"
);
const CARD = fs.readFileSync(
  path.join(
    ROOT, "src", "app", "(dashboard)", "app", "candidates", "network",
    "relationship-card.tsx"
  ),
  "utf8"
);

describe("§209 D1 — a request owns the row it wrote", () => {
  it("keeps the id record_network_suppression returns", () => {
    // It used to be spent on a truthiness test and thrown away.
    expect(FILE).toMatch(
      /v_sup := public\.record_network_suppression\(\s*\n?\s*v_profile, 'erasure requested via their portal', 'erasure'\)/
    );
    expect(FILE).toMatch(
      /UPDATE public\.candidate_erasure_requests\s*\n\s*SET suppression_id = v_sup\s*\n\s*WHERE id = v_request/
    );
    expect(FILE).toMatch(/RETURNING id INTO v_request/);
  });

  it("the column cannot outlive the row it points at", () => {
    // If the ledger row goes, the pointer must go NULL — a request that
    // cannot name its row lifts nothing rather than guessing.
    expect(M157).toMatch(
      /suppression_id uuid\s*\n\s*REFERENCES public\.network_suppressions\(id\) ON DELETE SET NULL/
    );
  });

  it("the decline lifts the BOUND row and never re-finds one", () => {
    expect(ACTIONS).toMatch(/p_suppression: updated\.suppression_id,/);
    // The fingerprint, in every spelling it had: matching on the source or
    // ordering by set_at to pick "the erasure row on this profile".
    expect(ACTIONS).not.toMatch(/\.eq\("source", "erasure"\)/);
    expect(ACTIONS).not.toMatch(/\.order\("set_at"/);
    expect(ACTIONS).not.toMatch(/from\("network_suppressions"\)/);
  });

  it("an unidentifiable suppression lifts NOTHING and says so", () => {
    const decline = ACTIONS.slice(ACTIONS.indexOf("D5, the half with teeth"));
    expect(decline).toMatch(/if \(updated\.suppression_id\) \{/);
    expect(decline).toMatch(/cannot be identified, so nothing was lifted/);
    // The honest absence must THROW, not warn — a console line is not a
    // refusal, and the operator would never see it.
    const elseArm = decline.slice(decline.indexOf("} else if"));
    expect(elseArm).toMatch(/throw new Error\(/);
    expect(elseArm).not.toMatch(/console\.(warn|log|error)/);
  });

  it("the backfill binds only the unambiguous case", () => {
    // Exactly one unlifted erasure row on the person, or nothing: where a
    // profile holds several, which one a request wrote is unknowable.
    expect(M157).toMatch(
      /AND 1 = \(SELECT count\(\*\) FROM public\.network_suppressions s2/
    );
    expect(M157).toMatch(/AND r\.suppression_id IS NULL/);
    expect(M157).toMatch(/WHERE r\.status = 'open'/);
  });
});

describe("§209 D2 — a move is recorded, and is not a copy", () => {
  it("stamps the move from a trigger, so no writer can forget it", () => {
    expect(M157).toMatch(
      /CREATE TRIGGER network_suppressions_stamp_move\s*\n\s*BEFORE UPDATE OF profile_id ON public\.network_suppressions/
    );
    expect(STAMP).toMatch(/NEW\.profile_id IS DISTINCT FROM OLD\.profile_id/);
    expect(STAMP).toMatch(/NEW\.moved_from_profile := OLD\.profile_id;/);
    expect(STAMP).toMatch(/NEW\.moved_at\s+:= now\(\);/);
  });

  it("never touches carried_from — a lift must not widen by one person", () => {
    expect(STAMP).not.toMatch(/carried_from/);
  });

  it("a merge of a merge keeps naming the ORIGINAL person", () => {
    expect(STAMP).toMatch(/AND NEW\.moved_from_profile IS NULL/);
  });

  it("branches on the ids in hand, never on FOUND", () => {
    // Migration 156's trap: a statement between the read and the branch
    // rewrites FOUND, and the wrong arm runs.
    expect(STAMP).not.toMatch(/\bIF\s+FOUND\b/);
    expect(STAMP).not.toMatch(/\bIF\s+NOT\s+FOUND\b/);
  });

  it("a move is complete or absent", () => {
    expect(M157).toMatch(
      /CONSTRAINT move_is_complete CHECK \(\s*\n?\s*\(moved_at IS NULL\) = \(moved_from_profile IS NULL\)/
    );
  });
});

describe("§209 D3 — the card says a reason came across", () => {
  it("loads the move with the rest of the row", () => {
    expect(RESOLVER).toMatch(/moved_from_label, moved_at,/);
    expect(RESOLVER).toMatch(/moved_from_label: row\.moved_from_label,/);
  });

  it("renders the move only when one was stamped", () => {
    expect(CARD).toMatch(/\{s\.moved_at && \(/);
    expect(CARD).toMatch(/Came across when \$\{s\.moved_from_label\} was merged in/);
  });

  it("says the move without a name rather than inventing one", () => {
    // moved_from_label is read from a profile that is about to be deleted;
    // an unreadable name is an absence, not a licence to guess (§175).
    expect(CARD).toMatch(/: "Came across from a person merged in"/);
  });
});

describe("§209 D4 — several open requests may stand against one person", () => {
  it("the open-request index keys on the IDENTITY, not the person", () => {
    expect(M157).toMatch(
      /DROP INDEX IF EXISTS public\.candidate_erasure_requests_open_idx/
    );
    expect(M157).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS candidate_erasure_requests_open_key_idx\s*\n\s*ON public\.candidate_erasure_requests \(organization_id, identity_key\)\s*\n\s*WHERE status = 'open'/
    );
    // The COALESCE onto the profile is what made a merge impossible.
    expect(M157).not.toMatch(
      /CREATE UNIQUE INDEX[\s\S]{0,200}COALESCE\(\(?network_profile_id/
    );
  });

  it("the portal still refuses a second request under one identity", () => {
    expect(FILE).toMatch(/EXCEPTION WHEN unique_violation THEN/);
    expect(FILE).toMatch(/your erasure request is already with the team/);
  });

  it("the queue counts the sharers, and says so", () => {
    expect(OPS_PAGE).toMatch(/created_at, network_profile_id"/);
    expect(OPS_PAGE).toMatch(/requestsPerPerson\.set\(/);
    expect(OPS_PAGE).toMatch(
      /shares_person_with: r\.network_profile_id\s*\n\s*\? \(requestsPerPerson\.get\(r\.network_profile_id\) \?\? 1\) - 1\s*\n\s*: 0,/
    );
    expect(QUEUE).toMatch(/\{r\.shares_person_with > 0 && \(/);
    expect(QUEUE).toMatch(/same person as \{r\.shares_person_with\} other/);
  });

  it("a request with no resolved person is nobody's duplicate", () => {
    expect(OPS_PAGE).toMatch(/if \(!r\.network_profile_id\) continue;/);
  });
});
