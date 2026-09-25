import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The wiring around CV dedupe (141).
 *
 * ## What this proves, and what it does not
 *
 * `dedupe.test.ts` pins the DECISIONS behaviourally — those are pure
 * functions and they are tested as such. This file reads source text, and
 * source text can only ever prove that the code says something. It cannot
 * prove the action runs, that Supabase accepted the delete, or that the
 * recruiter saw the sentence. Only a drive proves those, and drive 133 did.
 *
 * It earns its place because three of the four claims below are about
 * ORDER and ANCHORING — properties that are invisible in a unit test of a
 * pure function and expensive to reach in an integration test, and each of
 * which failed silently rather than loudly when it was wrong:
 *
 *  · a pre-parse check that runs AFTER the insert has already spent the
 *    money it exists to save, and every test of it still passes;
 *  · a discard event anchored to the DELETED row is erased by the cascade
 *    that deletes the row, so the trail simply has a gap;
 *  · a fourth transcription of the person-identity rule drifts silently for
 *    months, which is the entire reason the shared module exists.
 */

const ROOT = path.join(process.cwd(), "src");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const ACTION = "app/(dashboard)/app/projects/[id]/candidates/actions.ts";

describe("the upload action wires both halves of D1", () => {
  const src = read(ACTION);

  it("hashes the file and checks it before ANY row is inserted", () => {
    const hashed = src.indexOf("await sha256Hex(");
    const checked = src.indexOf("matchFile(");
    const inserted = src.indexOf('.from("candidates")\n      .insert({');

    expect(hashed).toBeGreaterThan(-1);
    expect(checked).toBeGreaterThan(-1);
    expect(inserted).toBeGreaterThan(-1);

    // The whole point of the cheap half: a refusal must cost nothing and
    // leave nothing. Checking after the insert would leave a row and a
    // billed parse behind and still look like a passing dedupe.
    expect(hashed).toBeLessThan(inserted);
    expect(checked).toBeLessThan(inserted);
  });

  it("returns the skip WITHOUT parsing when the same file is already here", () => {
    const skipBranch = src.indexOf('fileMatch.kind === "same_mandate"');
    const parse = src.indexOf("await runCvParseAndPersist(");
    expect(skipBranch).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(-1);
    expect(skipBranch).toBeLessThan(parse);
    expect(src).toContain('outcome: "same_file_skipped"');
  });

  it("stores the hash on the row it just created", () => {
    // Without this the check above can never fire for anybody: every
    // upload would look new forever.
    expect(src).toContain("cv_sha256: fileHash");
  });

  it("classifies the person only after the parse has returned", () => {
    const parse = src.indexOf("await runCvParseAndPersist(");
    const classify = src.indexOf("classifyAgainstMandate(");
    expect(classify).toBeGreaterThan(parse);
  });

  it("anchors the discard event to the SURVIVING row, not the deleted one", () => {
    // activity_events.candidate_id is ON DELETE CASCADE (053). An event
    // naming the discarded candidate is deleted by the act it records, and
    // the failure is a silent gap in the trail rather than an error.
    const idx = src.indexOf('eventType: "candidate_duplicate_discarded"');
    expect(idx).toBeGreaterThan(-1);
    // Bounded by the call's own `detail:` rather than by a character count.
    // A fixed window reached past the closing brace into the `return` below,
    // which names the same field — so the assertion passed on the return's
    // text while the EVENT was anchored wrongly. Caught by mutation testing,
    // and the reason this slice is bounded structurally.
    const detail = src.indexOf("detail: {", idx);
    expect(detail).toBeGreaterThan(idx);
    const block = src.slice(idx, detail);
    expect(block).toContain("candidateId: person.candidateId");
  });

  it("deletes the stored object before the row", () => {
    // Row first, then a failed object delete, leaves a live row pointing at
    // bytes that are gone — the worse of the two half-states.
    const object = src.indexOf('.from("cvs")\n        .remove(');
    const row = src.indexOf('.from("candidates")\n        .delete()');
    expect(object).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(-1);
    expect(object).toBeLessThan(row);
  });
});

describe("the bulk intake form skips repeats inside one batch", () => {
  const src = read("app/(dashboard)/app/candidates/intake/intake-form.tsx");

  it("hashes each file as it is added", () => {
    expect(src).toContain("sha256Hex");
    expect(src).toContain('status: "duplicate"');
  });

  it("counts duplicates from the status, never by sniffing the message text", () => {
    expect(src).toContain('f.status === "duplicate"');
    expect(src).not.toContain("message?.startsWith");
  });

  it("gives BOTH duplicate outcomes the same chip", () => {
    // Drive 133 found the in-mandate skip reading "SKIPPED" and the
    // in-batch one reading "DUPLICATE" — same fact, same cost, two words,
    // and the summary counted one of the two. `same_file_skipped` must
    // not be mapped to any status of its own.
    expect(src).not.toMatch(/same_file_skipped"?\s*\n?\s*\?\s*"skipped"/);
    expect(src).toContain('result.outcome === "parsed" ? "parsed" : "duplicate"');
  });
});

describe("person identity is declared exactly once", () => {
  it("no file outside candidate-identity.ts declares its own identityKey", () => {
    // 141 deleted the fourth transcription (network/actions.ts), which was
    // character-identical to the shared one and sat in the file holding the
    // product's oldest duplicate refusal. Two SQL transcriptions (040, 073)
    // remain and are documented; a THIRD copy in TypeScript is never right,
    // so this is structural rather than a list of known files.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const rel = path.relative(ROOT, full);
        if (rel === path.join("lib", "candidate-identity.ts")) continue;
        const text = fs.readFileSync(full, "utf8");
        if (/(^|\s)function\s+identityKey\s*\(/.test(text)) {
          offenders.push(rel);
        }
      }
    };
    walk(ROOT);
    expect(offenders).toEqual([]);
  });

  it("the copy-into-mandate refusal reads the shared rule", () => {
    const src = read("app/(dashboard)/app/candidates/network/actions.ts");
    expect(src).toContain('from "@/lib/candidate-identity"');
  });
});
