import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveParsedIdentity } from "./identity";

/**
 * G.1, G.2 and G.3 — the guard for §192's finding.
 *
 * The defect this protects against ran in production and was found by a
 * teardown, not by a test: an applicant typed one identity, the parser
 * stored the CV's, and because `candidate_identity_key` keys on email
 * the row was silently re-linked to a different person's relationship
 * record — which is the record `send-candidate-message.ts` reads
 * `dnc` from. The do-not-contact gate answered for the wrong human.
 *
 * Most of this file asserts BEHAVIOUR, because the decision was
 * deliberately extracted into a pure function so that it could. Only the
 * last block falls back to source text, and it says why.
 */

const UPLOAD = {
  parsedName: "Vladimir Breygin",
  parsedEmail: "vlad@flexcpo.com",
  priorName: "drive125-cv",
  declared: null,
};

const DECLARED = {
  fullName: "Drive 125 Applicant",
  email: "drive125.applicant@example.com",
};

describe("a declared identity wins over the CV (G.1)", () => {
  it("keeps BOTH the typed name and the typed address", () => {
    const r = resolveParsedIdentity({ ...UPLOAD, priorName: DECLARED.fullName, declared: DECLARED });
    // The exact pair §192 found overwritten in production.
    expect(r.fullName).toBe("Drive 125 Applicant");
    expect(r.email).toBe("drive125.applicant@example.com");
    expect(r.fullName).not.toBe("Vladimir Breygin");
    expect(r.email).not.toBe("vlad@flexcpo.com");
  });

  it("does not claim the details changed when they did not", () => {
    // The trail must not say "updated the candidate's details" about a
    // row where the person's own answer was kept untouched.
    const r = resolveParsedIdentity({ ...UPLOAD, priorName: DECLARED.fullName, declared: DECLARED });
    expect(r.identityChanged).toBe(false);
  });

  it("keeps a declared name even when the CV has no claim at all", () => {
    const r = resolveParsedIdentity({
      parsedName: null,
      parsedEmail: null,
      priorName: DECLARED.fullName,
      declared: DECLARED,
    });
    expect(r.fullName).toBe("Drive 125 Applicant");
    expect(r.email).toBe("drive125.applicant@example.com");
  });

  it("honours a declared identity that gave no address", () => {
    const r = resolveParsedIdentity({
      ...UPLOAD,
      priorName: "Anon Applicant",
      declared: { fullName: "Anon Applicant", email: null },
    });
    // The CV's address must NOT fill the silence — that is the same
    // mining §190's D.3 refused for phone numbers.
    expect(r.email).toBeNull();
  });
});

describe("a recruiter upload is unchanged (G.1's other half)", () => {
  it("still takes the identity from the CV", () => {
    const r = resolveParsedIdentity(UPLOAD);
    // Nobody declared anything, so the file is the only identity there
    // is — reading it is the entire point of the upload.
    expect(r.fullName).toBe("Vladimir Breygin");
    expect(r.email).toBe("vlad@flexcpo.com");
    expect(r.identityChanged).toBe(true);
    expect(r.identityDeclared).toBe(false);
    expect(r.identityConflict).toBe(false);
  });

  it("falls back to the prior name, then to a placeholder", () => {
    expect(
      resolveParsedIdentity({ ...UPLOAD, parsedName: null }).fullName
    ).toBe("drive125-cv");
    expect(
      resolveParsedIdentity({ parsedName: null, parsedEmail: null, priorName: null, declared: null })
        .fullName
    ).toBe("Untitled candidate");
  });
});

describe("the disagreement is reported, never resolved (G.2)", () => {
  it("flags a conflict when the file names a different person", () => {
    const r = resolveParsedIdentity({ ...UPLOAD, priorName: DECLARED.fullName, declared: DECLARED });
    expect(r.identityConflict).toBe(true);
    expect(r.identityDeclared).toBe(true);
  });

  it("flags a conflict on the ADDRESS alone — the DNC-bearing field", () => {
    // Same human name, different address. This is the case that moves
    // the identity key, because the key prefers email over everything.
    const r = resolveParsedIdentity({
      parsedName: "Drive 125 Applicant",
      parsedEmail: "someone.else@example.com",
      priorName: DECLARED.fullName,
      declared: DECLARED,
    });
    expect(r.identityConflict).toBe(true);
  });

  it("does not cry conflict over case or padding", () => {
    const r = resolveParsedIdentity({
      parsedName: "  drive 125 APPLICANT ",
      parsedEmail: "Drive125.Applicant@Example.com",
      priorName: DECLARED.fullName,
      declared: DECLARED,
    });
    expect(r.identityConflict).toBe(false);
  });

  it("treats silence as agreement, not contradiction", () => {
    // A CV with no address does not DISAGREE about the address.
    const r = resolveParsedIdentity({
      parsedName: "Drive 125 Applicant",
      parsedEmail: null,
      priorName: DECLARED.fullName,
      declared: DECLARED,
    });
    expect(r.identityConflict).toBe(false);
  });
});

describe("migration 135 holds the link for a declared identity (G.3)", () => {
  /**
   * SOURCE TEXT, and only because the assertion is about SQL that no
   * vitest process can execute. THE DUPLICATION IS THE CHECK: if the
   * clause below is edited away, this test must fail.
   *
   * Mutation-tested 2026-08-27 before being trusted — removing the
   * `source = 'apply'` guard from the migration fails this test, and the
   * live behaviour was proven separately in a rolled-back transaction
   * against production: an `apply` row HELD its link across an identity
   * overwrite while an `upload` row re-keyed, the two differing only by
   * `source`.
   */
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/135_declared_identity_holds_its_link.sql"),
    "utf8"
  );

  it("freezes the link on an apply row, and only on an apply row", () => {
    expect(sql).toContain("TG_OP = 'UPDATE'");
    expect(sql).toContain("NEW.source = 'apply'");
    expect(sql).toContain("OLD.network_profile_id IS NOT NULL");
    expect(sql).toContain("NEW.network_profile_id := OLD.network_profile_id");
  });

  it("still resolves every other row, so uploads are not stranded", () => {
    // The recruiter path inserts a placeholder named after the FILE and
    // only learns who the person is when the parser runs. Freeze that
    // and every upload keeps a filename-shaped relationship record.
    expect(sql).toContain("public.resolve_network_profile(");
  });

  it("revokes the replaced function, per the 110/121/125 doctrine", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.candidates_link_network_profile()");
  });
});
