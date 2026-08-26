import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The three doors render the same client-facing portal, and each one
 * must say out loud what it can do.
 *
 * This guard exists because the claim drifted from the code silently.
 * `client-interview-section.tsx` documented three doors rendering the
 * approved question set — the token path answering, the founder preview
 * and the signed-in /portal reading it. Two doors honoured that. The
 * third never passed the prop at all, so the signed-in client saw
 * nothing where the comment promised a read-only set, and the anonymous
 * token holder could answer questions the named, share-verified,
 * grant-checked client could not. It survived §144 and §145 unnoticed
 * because nothing failed: an absent optional prop renders an absent
 * section, which looks exactly like a mandate with no approved set.
 *
 * A type cannot catch this — the prop is legitimately optional, because
 * the founder preview must be able to omit it. So the shape of each
 * door is pinned here as source text instead.
 */

const SRC = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}

const TOKEN_DOOR = "app/hm/[token]/page.tsx";
const PORTAL_DOOR = "app/portal/mandates/[id]/page.tsx";
const PREVIEW_DOOR =
  "app/(dashboard)/app/projects/[id]/hiring-manager/page.tsx";
const SECTION =
  "app/(dashboard)/app/projects/[id]/hiring-manager/client-interview-section.tsx";

describe("the client-interview doors", () => {
  it("every door that renders the portal also renders the question set", () => {
    for (const door of [TOKEN_DOOR, PORTAL_DOOR, PREVIEW_DOOR]) {
      expect(
        read(door).includes("clientInterview="),
        `${door} renders PortalContent without passing clientInterview — ` +
          "the approved question set would be invisible on that door"
      ).toBe(true);
    }
  });

  it("both answering doors declare where answers go", () => {
    for (const door of [TOKEN_DOOR, PORTAL_DOOR]) {
      expect(
        read(door).includes("interviewAnswerDoor="),
        `${door} can answer but names no answer door`
      ).toBe(true);
    }
  });

  it("the founder preview stays read-only", () => {
    // The preview shows the desk its own client's page. An answer form
    // there would let staff answer on the client's behalf, which is the
    // one thing this section must never allow.
    expect(read(PREVIEW_DOOR)).not.toContain("interviewAnswerDoor=");
  });

  it("only the anonymous door asks for a name", () => {
    // On the signed-in door the route stamps the session's own identity
    // and ignores the body's label, so a name field there could only
    // ever be a way to sign somebody else's name to your words.
    expect(read(PORTAL_DOOR)).toContain("identityKnown: true");
    expect(read(TOKEN_DOOR)).toContain("identityKnown: false");
    expect(read(SECTION)).toContain("door?.identityKnown ?");
  });
});
