import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The merge's wiring (142).
 *
 * `merge.test.ts` pins the words behaviourally. This file reads source
 * text, and source text only ever proves that the code SAYS something —
 * that the merge actually reparents eighteen tables in one transaction was
 * proven by a live call through PostgREST and by drive 134, not here.
 *
 * It earns its place because these are ORDER and COVERAGE properties, and
 * every one of them fails silently rather than loudly:
 *
 *  · reparenting `feedback` after the delete does not warn, it ABORTS the
 *    merge — and only for candidates that have feedback, which are the
 *    ones a recruiter has worked hardest on;
 *  · a new table with a candidate_id FK that nobody adds here is either
 *    orphaned or a permanent merge failure, discovered months later;
 *  · `v_filled || 'email'` parses the literal as an array and throws —
 *    which the smoke test caught only because a field happened to be
 *    blank, i.e. it would have fired on the first REAL merge.
 */

const ROOT = path.join(process.cwd(), "src");
const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

const MERGE_SQL_RAW = fs.readFileSync(
  path.join(MIGRATIONS, "142_candidate_merge.sql"),
  "utf8"
);

/**
 * Comments stripped before anything is asserted about the CODE.
 *
 * This file's own first draft failed on `v_filled || '` — matching the
 * COMMENT that explains why that operator is wrong. A source-text guard
 * that reads prose is asserting about documentation, not behaviour, and
 * would go green the moment someone reworded a comment.
 */
const MERGE_SQL = MERGE_SQL_RAW.split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("the merge function's order of operations", () => {
  it("reparents feedback BEFORE deleting the discarded record", () => {
    // feedback_candidate_id_fkey has NO `ON DELETE` clause, so it is
    // NO ACTION and blocks the delete outright. Proven live:
    //   B feedback: BLOCKED -> violates foreign key constraint
    //                          "feedback_candidate_id_fkey"
    const feedbackMove = MERGE_SQL.indexOf("UPDATE public.feedback SET candidate_id");
    const del = MERGE_SQL.indexOf("DELETE FROM public.candidates WHERE id = p_discard");
    expect(feedbackMove).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(-1);
    expect(feedbackMove).toBeLessThan(del);
  });

  it("refuses a placement on the discarded record before touching anything", () => {
    const refusal = MERGE_SQL.indexOf("remove the placement first");
    const firstWrite = MERGE_SQL.indexOf("UPDATE public.candidate_notes");
    expect(refusal).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(firstWrite);
  });

  it("anchors the merge event to the SURVIVOR", () => {
    // activity_events.candidate_id cascades; an event naming the discarded
    // row is deleted by the act it records (§201's lesson, second outing).
    //
    // Anchored on the CALL, not on the event name: the first
    // `'candidates_merged'` in this file is the CHECK-constraint list at
    // the top, so slicing from it asserted about the wrong construct
    // entirely — §201's fixed-window mistake in a new costume.
    const idx = MERGE_SQL.indexOf("PERFORM public.write_activity_event(");
    expect(idx).toBeGreaterThan(-1);
    const call = MERGE_SQL.slice(idx, MERGE_SQL.indexOf("p_detail", idx));
    expect(call).toContain("'candidates_merged'");
    expect(call).toContain("p_candidate_id    => p_keep");
    expect(call).not.toContain("p_discard");
  });

  it("writes the trail row before the delete, inside the same transaction", () => {
    const event = MERGE_SQL.indexOf("PERFORM public.write_activity_event(");
    const del = MERGE_SQL.indexOf("DELETE FROM public.candidates WHERE id = p_discard");
    expect(event).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(-1);
    expect(event).toBeLessThan(del);
  });

  it("appends to v_filled with array_append, never the || operator", () => {
    // `text[] || 'email'` resolves to anyarray || anyarray and throws
    // `malformed array literal: "email"`.
    expect(MERGE_SQL).not.toMatch(/v_filled \|\| '/);
    expect((MERGE_SQL.match(/array_append\(v_filled/g) ?? []).length).toBe(6);
  });

  it("re-derives the org from the session instead of trusting the caller", () => {
    expect(MERGE_SQL).toContain("v_org      uuid := (SELECT public.current_user_org_id())");
    expect(MERGE_SQL).toContain("organization_id = v_org");
  });

  it("refuses a cross-mandate pair and a self-merge", () => {
    expect(MERGE_SQL).toContain("both records must be in the same mandate");
    expect(MERGE_SQL).toContain("a record cannot be merged into itself");
  });

  it("is gated on can_write_candidates", () => {
    expect(MERGE_SQL).toContain("public.can_write_candidates()");
  });
});

describe("every table that hangs off a candidate is accounted for", () => {
  it("names each candidate_id FK table in the merge", () => {
    // THE guard in this file. A nineteenth table added later and not
    // handled here is either orphaned by the merge or makes the merge
    // fail forever — and nothing else would notice. So the list is
    // derived from the migrations rather than written down.
    const tables = new Set<string>();
    for (const file of fs.readdirSync(MIGRATIONS)) {
      if (!file.endsWith(".sql")) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");

      // CREATE TABLE ... ( ... candidate_id ... REFERENCES public.candidates
      const createRe =
        /CREATE TABLE IF NOT EXISTS public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/g;
      let m: RegExpExecArray | null;
      while ((m = createRe.exec(sql))) {
        const [, table, body] = m;
        if (table === "candidates") continue;
        if (/REFERENCES public\.candidates\(id\)/.test(body)) tables.add(table);
      }
    }

    expect(tables.size).toBeGreaterThan(10);

    // Tables that deliberately never move, each with its reason. A new
    // table cannot join this list by accident — it has to be typed here.
    const EXEMPT: Record<string, string> = {
      placements: "D3 refuses the merge outright rather than moving money",
    };

    // MENTIONING a table is not HANDLING it. The first draft of this guard
    // checked `public.<table>` appeared anywhere in the file, and removing
    // the `UPDATE public.prescreens SET candidate_id = p_keep` line went
    // UNCAUGHT, because `prescreens` still appeared in its collision
    // check. Handling means the rows are actually reparented.
    const missing = [...tables].filter((t) => {
      if (EXEMPT[t]) return false;
      const reparent = new RegExp(
        `UPDATE public\\.${t} SET (candidate_id|matched_candidate_id|promoted_candidate_id) = p_keep`
      );
      return !reparent.test(MERGE_SQL);
    });
    expect(missing).toEqual([]);
  });
});

describe("the screen", () => {
  const page = fs.readFileSync(
    path.join(
      ROOT,
      "app/(dashboard)/app/projects/[id]/candidates/[candidateId]/page.tsx"
    ),
    "utf8"
  );
  const panel = fs.readFileSync(
    path.join(
      ROOT,
      "app/(dashboard)/app/projects/[id]/candidates/[candidateId]/merge-panel.tsx"
    ),
    "utf8"
  );
  const action = fs.readFileSync(
    path.join(
      ROOT,
      "app/(dashboard)/app/projects/[id]/candidates/[candidateId]/merge-actions.ts"
    ),
    "utf8"
  );

  it("no longer tells the reader to delete a record", () => {
    // §201 shipped "delete the record you do not want" with no
    // delete-candidate action anywhere in the product — §199's doctrine,
    // committed by the slice that wrote the notice.
    expect(page).not.toContain("delete the record you do not want");
    expect(page).toContain("<MergePanel");
  });

  it("requires the capability as a prop rather than defaulting it", () => {
    expect(panel).toContain("canMerge: boolean;");
    expect(panel).not.toMatch(/canMerge\s*=\s*(true|false)/);
    expect(page).toContain('can(access?.role, "candidates:write")');
  });

  it("confirms before merging, with the authored text", () => {
    expect(panel).toContain("window.confirm(describeConfirm(");
  });

  it("deletes the discarded CV AFTER the merge commits, not before", () => {
    // The RPC can refuse (D3). Destroying a file for a merge that never
    // happened is worse than an inert orphaned object — the opposite of
    // §201's discard, where the row survives a failed delete.
    const rpc = action.indexOf('supabase.rpc("merge_candidates"');
    const remove = action.indexOf('.from("cvs")');
    expect(rpc).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(rpc);
  });

  it("calls the action through unwrap, as call-sites.test.ts requires", () => {
    expect(panel).toContain("unwrap(\n        await mergeCandidatesAction(");
  });
});
