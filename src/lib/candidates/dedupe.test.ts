import { describe, expect, it } from "vitest";
import {
  sha256Hex,
  matchFile,
  classifyAgainstMandate,
  describeSkippedFile,
  describeDiscard,
  describeAmbiguous,
  describeOtherMandate,
  type PoolCandidate,
} from "./dedupe";

/**
 * CV dedupe — the guard for migration 141 and its gate.
 *
 * Everything here asserts BEHAVIOUR, not source text. The one thing a
 * source-text check would be good for — that the action wires these
 * functions up at all — is covered by `dedupe-wiring.test.ts`, which says
 * plainly that wiring is all it proves.
 */

function person(over: Partial<PoolCandidate> & { id: string }): PoolCandidate {
  return {
    full_name: "Jane Doe",
    email: null,
    linkedin_url: null,
    current_company: null,
    project_id: "mandate-a",
    pipeline_stage: "found",
    ...over,
  };
}

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("sha256Hex — document identity", () => {
  it("returns the published SHA-256 of a known input", async () => {
    // The standard vector. If this ever changes, the stored hashes of every
    // CV uploaded since 141 are meaningless — so it is pinned by value.
    expect(await sha256Hex(bytes("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("gives the same hash to the same bytes and different hashes to different bytes", async () => {
    expect(await sha256Hex(bytes("a CV"))).toBe(await sha256Hex(bytes("a CV")));
    expect(await sha256Hex(bytes("a CV"))).not.toBe(
      await sha256Hex(bytes("a CV "))
    );
  });

  it("hashes a VIEW over a larger buffer as its own bytes only", async () => {
    // The trap this exists for: a Uint8Array can be a window onto a bigger
    // pooled ArrayBuffer (Buffer.from does this). Handing the buffer to
    // crypto.subtle instead of the view would hash the whole pool, and two
    // identical CVs read moments apart would get two different hashes — a
    // dedupe that silently never fires.
    const pool = new Uint8Array(64);
    pool.set(bytes("abc"), 16);
    const view = pool.subarray(16, 19);
    expect(view.byteLength).toBe(3);
    expect(await sha256Hex(view)).toBe(await sha256Hex(bytes("abc")));
  });
});

describe("matchFile — the pre-parse door", () => {
  it("passes a file nobody has", () => {
    expect(matchFile("mandate-a", [])).toEqual({ kind: "none" });
  });

  it("refuses a byte-identical file already in the SAME mandate", () => {
    const match = matchFile("mandate-a", [
      person({ id: "c1", full_name: "Jane Doe", project_id: "mandate-a" }),
    ]);
    expect(match).toEqual({
      kind: "same_mandate",
      candidateId: "c1",
      label: "Jane Doe",
    });
  });

  it("reports — and does NOT refuse — the same file in another mandate (D4)", () => {
    const match = matchFile("mandate-a", [
      person({ id: "c9", full_name: "Jane Doe", project_id: "mandate-b" }),
    ]);
    expect(match.kind).toBe("other_mandate");
  });

  it("prefers the refusal when the file is in this mandate AND another", () => {
    // The useful answer is the one that saves the parse.
    const match = matchFile("mandate-a", [
      person({ id: "elsewhere", project_id: "mandate-b" }),
      person({ id: "here", project_id: "mandate-a" }),
    ]);
    expect(match).toMatchObject({ kind: "same_mandate", candidateId: "here" });
  });
});

describe("classifyAgainstMandate — the post-parse verdict", () => {
  const subject = {
    full_name: "Jane Doe",
    email: "jane@acme.com",
    linkedin_url: null,
    current_company: "Acme",
  };

  it("finds nobody in an empty mandate", () => {
    expect(classifyAgainstMandate(subject, []).kind).toBe("none");
  });

  it("calls a shared email a duplicate, and says which stage the survivor is at", () => {
    const match = classifyAgainstMandate(subject, [
      person({
        id: "c1",
        full_name: "J. Doe",
        email: "JANE@acme.com",
        pipeline_stage: "interviewing",
      }),
    ]);
    expect(match).toEqual({
      kind: "duplicate",
      candidateId: "c1",
      label: "J. Doe",
      matchedOn: "email",
      stage: "interviewing",
    });
  });

  it("calls a shared LinkedIn profile a duplicate, trailing slash and case ignored", () => {
    const match = classifyAgainstMandate(
      {
        full_name: "Jane Doe",
        email: null,
        linkedin_url: "https://LinkedIn.com/in/janedoe/",
        current_company: "Acme",
      },
      [
        person({
          id: "c2",
          linkedin_url: "https://linkedin.com/in/janedoe",
        }),
      ]
    );
    expect(match).toMatchObject({
      kind: "duplicate",
      candidateId: "c2",
      matchedOn: "linkedin",
    });
  });

  it("calls a name-and-employer match AMBIGUOUS, never a duplicate (D3)", () => {
    const match = classifyAgainstMandate(
      {
        full_name: "James Chen",
        email: null,
        linkedin_url: null,
        current_company: "Barclays",
      },
      [person({ id: "c3", full_name: "James Chen", current_company: "Barclays" })]
    );
    expect(match).toEqual({
      kind: "ambiguous",
      candidateId: "c3",
      label: "James Chen",
    });
  });

  it("flags the CV-v2 case: one row has an email, the other has none", () => {
    // The case a strict key comparison misses entirely — `email:…` and
    // `name:…` are not equal — and the one recruiters hit most.
    const match = classifyAgainstMandate(subject, [
      person({ id: "c4", full_name: "Jane Doe", current_company: "Acme" }),
    ]);
    expect(match).toEqual({
      kind: "ambiguous",
      candidateId: "c4",
      label: "Jane Doe",
    });
  });

  it("the weak pass can NEVER return duplicate — nothing it finds may be deleted", () => {
    const weakOnly = classifyAgainstMandate(subject, [
      person({ id: "c4", full_name: "Jane Doe", current_company: "Acme" }),
    ]);
    expect(weakOnly.kind).not.toBe("duplicate");
  });

  it("treats two DIFFERENT emails as evidence of two different people", () => {
    // Same name, same employer, but the strong identifiers disagree. That
    // is positive evidence of two humans and it outranks the shared name.
    const match = classifyAgainstMandate(subject, [
      person({
        id: "c5",
        full_name: "Jane Doe",
        current_company: "Acme",
        email: "jane.doe@acme.com",
      }),
    ]);
    expect(match.kind).toBe("none");
  });

  it("treats two different LinkedIn profiles the same way", () => {
    const match = classifyAgainstMandate(
      {
        full_name: "Jane Doe",
        email: null,
        linkedin_url: "https://linkedin.com/in/janedoe",
        current_company: "Acme",
      },
      [
        person({
          id: "c6",
          current_company: "Acme",
          linkedin_url: "https://linkedin.com/in/jane-doe-2",
        }),
      ]
    );
    expect(match.kind).toBe("none");
  });

  it("does not match two people with the same name at DIFFERENT employers", () => {
    const match = classifyAgainstMandate(
      {
        full_name: "Jane Doe",
        email: null,
        linkedin_url: null,
        current_company: "Acme",
      },
      [person({ id: "c7", full_name: "Jane Doe", current_company: "Globex" })]
    );
    expect(match.kind).toBe("none");
  });

  it("does not let a filename-named row match a real person", () => {
    // §139's rule one layer up: a row whose only identity is a filename is
    // not somebody, and must not be folded into somebody.
    const match = classifyAgainstMandate(
      {
        full_name: "jane-doe-cv-final-v2",
        email: null,
        linkedin_url: null,
        current_company: null,
      },
      [person({ id: "c8", full_name: "Jane Doe", email: "jane@acme.com" })]
    );
    expect(match.kind).toBe("none");
  });
});

describe("the sentences", () => {
  it("the discard says which record survived AND that the file was dropped", () => {
    // Both halves, always. Silently discarding a document somebody chose is
    // the failure this wording exists to prevent.
    const s = describeDiscard("Jane Doe", "email", "interviewing");
    expect(s).toContain("Jane Doe");
    expect(s).toContain("interviewing");
    expect(s).toContain("same email address");
    expect(s).toContain("NOT kept");
  });

  it("the discard still reads when the survivor has no stage", () => {
    expect(describeDiscard("Jane Doe", "linkedin", null)).not.toContain(
      "at stage"
    );
  });

  it("the ambiguous sentence claims a shared name, never a shared person", () => {
    const s = describeAmbiguous("James Chen");
    expect(s).toContain("same name and employer");
    expect(s).toContain("two people who share a name");
    expect(s).toContain("Nothing has been merged");
    // The weak pass flags pairs where ONE side has an email, so the copy
    // must not assert that neither does.
    expect(s).not.toContain("Neither record carries an email");
  });

  it("the skip sentence says nothing was spent", () => {
    const s = describeSkippedFile("jane-doe.pdf");
    expect(s).toContain("no parse was run");
  });

  it("the other-mandate note is a fact, not a refusal", () => {
    const s = describeOtherMandate("Jane Doe");
    expect(s).toContain("Parsed anyway");
  });
});
