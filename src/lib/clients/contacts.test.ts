import { describe, expect, it } from "vitest";
import {
  CLIENT_NOTE_TYPES,
  CLIENT_NOTE_VISIBILITIES,
  CLIENT_NOTE_VISIBILITY_HINTS,
  CLIENT_NOTE_VISIBILITY_LABELS,
  CONTACT_TYPES,
  CONTACT_TYPE_LABELS,
  contactEmailKey,
  contactLabel,
  parseClientNoteType,
  parseClientNoteVisibility,
  parseContactType,
  sortContacts,
  type ClientContactRow,
} from "./contacts";

function contact(overrides: Partial<ClientContactRow> = {}): ClientContactRow {
  return {
    id: "contact-1",
    organization_id: "org-1",
    client_id: "client-1",
    full_name: "Jane Okafor",
    title: null,
    email: null,
    phone: null,
    linkedin_url: null,
    email_key: null,
    contact_type: "hiring_manager",
    is_primary: false,
    is_archived: false,
    created_by: null,
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * The dedupe key must agree with the generated column in 054:
 *
 *   email_key text GENERATED ALWAYS AS (nullif(btrim(lower(email)), '')) STORED
 *
 * The application predicts a collision so the user gets a sentence naming
 * the person already on file, rather than a unique-constraint name. If these
 * two drift, the prediction misses and the index reports the failure — which
 * is the same reason `clientNameKey` has a test beside it.
 */
describe("contactEmailKey", () => {
  it("matches the generated column: trim, lower-case", () => {
    expect(contactEmailKey("  JANE@Bank.Test  ")).toBe("jane@bank.test");
    expect(contactEmailKey("jane@bank.test")).toBe("jane@bank.test");
  });

  /**
   * The `nullif` is the load-bearing half. Without it an empty string is a
   * value, and two contacts with no email would collide on the unique index
   * — whereas any number of NULLs are permitted. That is the 051 lesson
   * applied one table later.
   */
  it("collapses blanks to null so several contacts may have no email", () => {
    for (const value of ["", "   ", "\t", null, undefined]) {
      expect(contactEmailKey(value)).toBeNull();
    }
  });
});

describe("contactLabel", () => {
  it("includes the title, because a name alone does not identify a person at a bank", () => {
    expect(contactLabel({ full_name: "Jane Okafor", title: "MD, Markets" })).toBe(
      "Jane Okafor // MD, Markets"
    );
  });

  it("falls back to the name when there is no title", () => {
    expect(contactLabel({ full_name: "Jane Okafor", title: null })).toBe("Jane Okafor");
    expect(contactLabel({ full_name: " Jane Okafor ", title: "  " })).toBe("Jane Okafor");
  });
});

describe("sortContacts", () => {
  it("puts the primary first, archived last, and the rest by name", () => {
    const rows = [
      contact({ id: "c", full_name: "Zoe" }),
      contact({ id: "b", full_name: "Amir", is_archived: true }),
      contact({ id: "a", full_name: "Raj", is_primary: true }),
      contact({ id: "d", full_name: "Bea" }),
    ];

    expect(sortContacts(rows).map((c) => c.id)).toEqual(["a", "d", "c", "b"]);
  });

  /**
   * An archived primary sorts after an active non-primary. Archiving wins
   * over the primary flag deliberately — a person who has left is not who we
   * deal with by default, whatever the row still says. The action clears
   * `is_primary` on archive, so this only arises for a row edited by hand.
   */
  it("ranks archived below active even when the archived row is primary", () => {
    const rows = [
      contact({ id: "archived-primary", full_name: "Aaa", is_primary: true, is_archived: true }),
      contact({ id: "active", full_name: "Zzz" }),
    ];

    expect(sortContacts(rows).map((c) => c.id)).toEqual(["active", "archived-primary"]);
  });

  it("does not mutate its argument", () => {
    const rows = [contact({ id: "b", full_name: "Zoe" }), contact({ id: "a", full_name: "Amir" })];
    sortContacts(rows);
    expect(rows.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

/**
 * The parsers narrow untrusted values the way `parseRole` does: a value
 * outside the vocabulary loses behaviour rather than gaining it, so a row
 * written by a migration this build predates cannot smuggle a tier in.
 */
describe("the parsers", () => {
  it("accept every member of their vocabulary", () => {
    for (const t of CONTACT_TYPES) expect(parseContactType(t)).toBe(t);
    for (const t of CLIENT_NOTE_TYPES) expect(parseClientNoteType(t)).toBe(t);
    for (const v of CLIENT_NOTE_VISIBILITIES) expect(parseClientNoteVisibility(v)).toBe(v);
  });

  it("refuse anything else", () => {
    for (const junk of ["", "admin", "fees", 7, null, undefined, {}, ["org"]]) {
      expect(parseContactType(junk)).toBeNull();
      expect(parseClientNoteType(junk)).toBeNull();
      expect(parseClientNoteVisibility(junk)).toBeNull();
    }
  });

  /**
   * `visibility` is the one that matters most: 'commercial' resolving to
   * anything other than itself, or an unknown string parsing as a tier,
   * would put a rate negotiation in front of a viewer.
   */
  it("never lets an unknown value become a visibility tier", () => {
    expect(parseClientNoteVisibility("private")).toBeNull();
    expect(parseClientNoteVisibility("ORG")).toBeNull();
    expect(parseClientNoteVisibility("admin")).toBeNull();
  });
});

describe("the label maps", () => {
  it("cover every vocabulary member, so no chip renders undefined", () => {
    for (const t of CONTACT_TYPES) expect(CONTACT_TYPE_LABELS[t]).toBeTruthy();
    for (const v of CLIENT_NOTE_VISIBILITIES) {
      expect(CLIENT_NOTE_VISIBILITY_LABELS[v]).toBeTruthy();
      expect(CLIENT_NOTE_VISIBILITY_HINTS[v]).toBeTruthy();
    }
  });

  /**
   * The hint is what tells an author who will read the note. "Commercial"
   * alone does not say that a viewer is excluded, and the cost of the
   * author misreading it is the thing the tier exists to prevent.
   */
  it("says who is excluded, not just what the tier is called", () => {
    expect(CLIENT_NOTE_VISIBILITY_HINTS.commercial).toMatch(/fees|revenue/i);
    expect(CLIENT_NOTE_VISIBILITY_HINTS.org).toMatch(/any active member/i);
  });
});
