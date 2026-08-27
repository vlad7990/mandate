import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CANDIDATE_PROFILE_SCHEMA,
  CV_PARSING_SYSTEM_PROMPT,
} from "./cv-parsing";

/**
 * §180 (F-H) — the profile can hold a qualification, and still cannot
 * hold a phone number.
 *
 * Nothing pinned CANDIDATE_PROFILE_SCHEMA before this test existed,
 * which is how `education` came to be absent from the product entirely
 * — not stripped, not TODO'd, simply never there, while the Job Spec
 * Builder went on emitting "must-have qualifications" the evaluator had
 * no way to check.
 *
 * The phone assertions are the interesting half. Ruling D.3(a) is a
 * decision about provenance, not a technical constraint: a candidate's
 * number reaches this system only by their own hand through the token
 * portal, so the emptiness of `candidates.phone` MEANS nobody has been
 * given it. A parser that helpfully filled it would destroy that signal
 * silently, and the failure would look like a feature. So the absence
 * is asserted, not assumed.
 */

const props = CANDIDATE_PROFILE_SCHEMA.properties as Record<string, unknown>;
const required = CANDIDATE_PROFILE_SCHEMA.required as readonly string[];

describe("the candidate profile schema (§180)", () => {
  it("carries education and certifications, and REQUIRES both", () => {
    expect(Object.keys(props)).toContain("education");
    expect(Object.keys(props)).toContain("certifications");
    // Required, per D.2: an optional field lets the model skip the
    // question rather than answer it with an empty array.
    expect(required).toContain("education");
    expect(required).toContain("certifications");
  });

  it("keeps the institution as its own field rather than a flattened string", () => {
    const education = props.education as {
      items: { required: string[]; properties: Record<string, unknown> };
    };
    // D.1: the institution is what a hiring manager actually asks about.
    expect(education.items.required).toEqual([
      "degree",
      "field",
      "institution",
      "year",
    ]);
    expect(Object.keys(education.items.properties)).toContain("institution");
  });

  it("still forbids anything the schema did not name", () => {
    // The property that made F-H structural in the first place. If this
    // ever flips to true the schema stops being a contract.
    expect(CANDIDATE_PROFILE_SCHEMA.additionalProperties).toBe(false);
  });

  // ---- D.3(a): no phone, anywhere ----

  it("has NO phone field, under any spelling", () => {
    for (const key of Object.keys(props)) {
      expect(key).not.toMatch(/phone|mobile|telephone|contact_number/i);
    }
  });

  it("instructs the parser never to return one", () => {
    // A schema with no phone field is not enough on its own: the model
    // could still park a number inside `location` or `summary`. The
    // prompt has to say so, and this pins that it does.
    expect(CV_PARSING_SYSTEM_PROMPT).toMatch(/NEVER return a telephone number/);
  });
});

describe("where the new fields may and may not travel (§180 D.4)", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const trimSite = path.join(
    ROOT,
    "src/app/(dashboard)/app/projects/[id]/actions.ts"
  );

  /** The literal body of trimProfile, which decides what ranking sees. */
  function trimProfileBody(): string {
    const source = fs.readFileSync(trimSite, "utf8");
    const start = source.indexOf("function trimProfile");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\n}", start);
    return source.slice(start, end);
  }

  it("keeps education OUT of the ranking prompt", () => {
    // Ruling D.4. A qualification is a gate against a stated
    // requirement, not a comparison axis — and trimProfile exists to
    // keep the ranking prompt compact. Source-text, because the
    // duplication IS the check: a shared constant would walk out from
    // under it.
    const body = trimProfileBody();
    expect(body).not.toMatch(/\beducation\b/);
    expect(body).not.toMatch(/\bcertifications\b/);
  });

  it("reaches the evaluation, which is handed the whole profile", () => {
    // The other half of D.4. generate-evaluation serialises the profile
    // object entire, so the fields arrive by construction — but the
    // evaluation prompt must actually be told to use them, or they ride
    // along unread and the qualification still goes unchecked.
    const prompt = fs.readFileSync(
      path.join(ROOT, "src/lib/ai/candidate-evaluation.ts"),
      "utf8"
    );
    expect(prompt).toMatch(/'education' and 'certifications'/);
    // And the rule that keeps it from becoming §176's defect again:
    // absent evidence is not a claim about the person.
    expect(prompt).toMatch(/A CV is not a transcript/);
  });
});
