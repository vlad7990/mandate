import { describe, expect, it } from "vitest";
import {
  warmth,
  previewPeopleMerge,
  describePeopleConfirm,
  describePeopleReceipt,
  type MergeablePerson,
  type PeopleMergeReceipt,
} from "./merge-people";

/**
 * The words in front of an irreversible merge of two PEOPLE.
 *
 * The mechanics are migration 143 and were proven live. What is pinned
 * here is that the confirm tells the truth about the two consequences a
 * recruiter cannot take back: a deleted record, and suppression spreading.
 */

function person(over: Partial<MergeablePerson> & { id: string }): MergeablePerson {
  return {
    displayName: "Rowan Delacroix",
    identityKey: "email:rowan@meridian.test",
    relationshipState: "cold",
    dnc: false,
    dncReason: null,
    candidates: 1,
    ...over,
  };
}

describe("warmth mirrors relationship_warmth in 143", () => {
  it("ranks the temperatures and refuses to rank the other two", () => {
    expect(warmth("cold")).toBe(0);
    expect(warmth("placed")).toBe(4);
    expect(warmth("warm")).toBeGreaterThan(warmth("contacted"));
    // Both are decided before warmth is consulted, in SQL and here.
    expect(warmth("client_contact")).toBe(-1);
    expect(warmth("do_not_contact")).toBe(-1);
  });
});

describe("previewPeopleMerge", () => {
  it("warns, in the recruiter's own terms, when suppression will spread", () => {
    const { warnings } = previewPeopleMerge(
      person({ id: "keep" }),
      person({
        id: "drop",
        displayName: "R. Delacroix",
        dnc: true,
        dncReason: "asked not to be contacted at work",
      })
    );
    const text = warnings.join(" ");
    expect(text).toContain("do-not-contact");
    expect(text).toContain("asked not to be contacted at work");
    expect(text).toContain("can never lift it");
  });

  it("says nothing about suppression when the kept person is already suppressed", () => {
    // Nothing changes for them, so a warning would be noise.
    const { warnings } = previewPeopleMerge(
      person({ id: "keep", dnc: true, dncReason: "left the market" }),
      person({ id: "drop", dnc: true, dncReason: "left the market" })
    );
    expect(warnings.join(" ")).not.toContain("becomes do-not-contact");
  });

  it("promises the alias, which is the whole reason the merge lasts", () => {
    const { carries } = previewPeopleMerge(
      person({ id: "keep" }),
      person({ id: "drop" })
    );
    expect(carries.join(" ")).toContain("alias");
    expect(carries.join(" ")).toContain("future CV");
  });

  it("names the warmer relationship only when it is actually the other one's", () => {
    const warmer = previewPeopleMerge(
      person({ id: "keep", relationshipState: "cold" }),
      person({ id: "drop", relationshipState: "warm" })
    );
    expect(warmer.carries.join(" ")).toContain("warmer relationship is kept: warm");

    const notWarmer = previewPeopleMerge(
      person({ id: "keep", relationshipState: "placed" }),
      person({ id: "drop", relationshipState: "cold" })
    );
    expect(notWarmer.carries.join(" ")).not.toContain("warmer relationship");
  });

  it("always warns that the other record is deleted and cannot come back", () => {
    const { warnings } = previewPeopleMerge(
      person({ id: "keep" }),
      person({ id: "drop" })
    );
    expect(warnings.join(" ")).toContain("cannot be undone");
  });
});

describe("describePeopleConfirm", () => {
  it("names both people, what carries, and what to be aware of", () => {
    const text = describePeopleConfirm(
      person({ id: "keep", displayName: "Rowan Delacroix", candidates: 2 }),
      person({ id: "drop", displayName: "R. Delacroix", candidates: 3, dnc: true })
    );
    expect(text).toContain(
      'Keep "Rowan Delacroix" and merge "R. Delacroix" into them?'
    );
    expect(text).toContain("3 candidate records move across");
    expect(text).toContain("Be aware:");
    expect(text).toContain("cannot be undone");
  });

  // §204, from drive 136: the confirm read "1 candidate record move across"
  // to the founder's face — a singular noun with a plural verb, on the one
  // sentence a recruiter reads before an irreversible act.
  it("agrees with itself about number", () => {
    const one = describePeopleConfirm(
      person({ id: "keep" }),
      person({ id: "drop", candidates: 1 })
    );
    expect(one).toContain("1 candidate record moves across");
    expect(one).not.toContain("record move across");

    const many = describePeopleConfirm(
      person({ id: "keep" }),
      person({ id: "drop", candidates: 4 })
    );
    expect(many).toContain("4 candidate records move across");
  });

  // §202's lesson, one object up. Drive 136 read: Keep "Sable Ashworth-Kinne"
  // and merge "Sable Ashworth-Kinne" into them? — true, and useless. Two
  // records of one human is the COMMON case here, not the edge.
  it("tells two identically-named people apart by what split them", () => {
    const text = describePeopleConfirm(
      person({ id: "keep", displayName: "Sable Ashworth-Kinne" }),
      person({
        id: "drop",
        displayName: "Sable Ashworth-Kinne",
        identityKey: "name:sable ashworth-kinne|northbridge industrial",
      })
    );
    expect(text).toContain("keyed on email");
    expect(text).toContain("keyed on name");
    expect(text).not.toContain(
      'Keep "Sable Ashworth-Kinne" and merge "Sable Ashworth-Kinne"'
    );
  });

  it("leaves genuinely different names alone", () => {
    const text = describePeopleConfirm(
      person({ id: "keep", displayName: "Rowan Delacroix" }),
      person({ id: "drop", displayName: "R. Delacroix" })
    );
    expect(text).toContain(
      'Keep "Rowan Delacroix" and merge "R. Delacroix" into them?'
    );
    expect(text).not.toContain("keyed on");
  });
});

describe("describePeopleReceipt", () => {
  function receipt(over: Partial<PeopleMergeReceipt> = {}): PeopleMergeReceipt {
    return {
      kept_id: "k",
      kept: "Rowan Delacroix",
      merged_in: "R. Delacroix",
      candidates: 1,
      aliases_moved: 0,
      state: "cold",
      dnc_carried: false,
      filled: [],
      ...over,
    };
  }

  it("reads what the database did, singularising as it goes", () => {
    expect(describePeopleReceipt(receipt())).toBe(
      'Merged "R. Delacroix" into "Rowan Delacroix". 1 candidate record moved across. Relationship: cold.'
    );
    expect(describePeopleReceipt(receipt({ candidates: 2 }))).toContain(
      "2 candidate records moved across"
    );
  });

  it("reports carried suppression LAST and never silently", () => {
    const text = describePeopleReceipt(
      receipt({ dnc_carried: true, state: "do_not_contact" })
    );
    expect(text).toContain("Do-not-contact carried across");
    expect(text.trim().endsWith("covers both records.")).toBe(true);
  });

  it("mentions earlier aliases that followed, because a merge of a merge is easy to miss", () => {
    expect(describePeopleReceipt(receipt({ aliases_moved: 2 }))).toContain(
      "2 earlier aliases followed"
    );
  });

  it("says nothing about filled fields when nothing was filled", () => {
    expect(describePeopleReceipt(receipt())).not.toContain("Filled");
  });
});
