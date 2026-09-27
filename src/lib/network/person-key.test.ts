import { describe, expect, it } from "vitest";
import { personKey } from "./person-key";

/**
 * §204's rule for rows that ALREADY EXIST. These moved out of the fold's own
 * test file in §205, when the TypeScript fold was deleted: the page reads the
 * `network_people_folded` view now, and `network-sql-parity.test.ts` holds the
 * view's shape against the row type the page maps.
 */

function row(over: Record<string, unknown> = {}) {
  return {
    full_name: "Rowan Delacroix",
    email: null,
    linkedin_url: null,
    current_company: "Meridian AG",
    network_profile_id: "np-rowan",
    ...over,
  } as Parameters<typeof personKey>[0];
}

describe("personKey — which person is this EXISTING row?", () => {
  it("is the profile id when the row has a person", () => {
    expect(personKey(row({ network_profile_id: "np-x" }))).toBe("np-x");
  });

  it("falls back to the computed key only when there is no person yet", () => {
    const k = personKey(row({ network_profile_id: null, email: "a@b.test" }));
    expect(k).toBe("key:email:a@b.test");
  });

  it("never lets the two namespaces collide on a value", () => {
    // A profile id is a uuid and a fallback is prefixed; nothing in the
    // fallback space can ever equal a profile id.
    expect(personKey(row({ network_profile_id: null }))).toMatch(/^key:/);
    expect(personKey(row({ network_profile_id: "np-x" }))).not.toMatch(/^key:/);
  });

  it("treats a blank profile id as no person, not as a person named ''", () => {
    expect(personKey(row({ network_profile_id: "  " }))).toMatch(/^key:/);
  });
});
