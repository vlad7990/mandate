import { describe, expect, it } from "vitest";
import {
  foldRowsIntoPeople,
  type NetworkCandidateRow,
  type NetworkProject,
  type NetworkScoreRow,
} from "./network-aggregator";
import { personKey } from "./person-key";

/**
 * The Network page's fold (§204).
 *
 * What these pin is the defect the gate proved live, in an aborting
 * transaction, on a merged and SUPPRESSED person:
 *
 *   overlay rows found for that key:  0   <- page shows: RELATIONSHIP (neutral)
 *
 * The fold used to bucket rows by a key recomputed from each row's own
 * fields. A merge (§203) repoints `network_profile_id` and cannot change
 * what a row computes to, so a merged person kept rendering as two rows —
 * and the second found no relationship profile at all, which renders
 * identically to an ordinary unsuppressed contact.
 */

const PROJECTS: NetworkProject[] = [
  { id: "p1", title: "COO Search", company_name: "Acme", status: "active" },
  { id: "p2", title: "CFO Search", company_name: "Meridian", status: "active" },
];

function row(over: Partial<NetworkCandidateRow>): NetworkCandidateRow {
  return {
    id: "c1",
    project_id: "p1",
    full_name: "Rowan Delacroix",
    email: null,
    linkedin_url: null,
    current_title: null,
    current_company: "Meridian AG",
    archetype: null,
    pipeline_stage: null,
    cv_structured: {},
    updated_at: "2026-09-01T00:00:00.000Z",
    network_profile_id: "np-rowan",
    ...over,
  };
}

/** One human, split the ordinary way: a CV with an email and one without.
 * The two rows compute DIFFERENT identity keys — that is WHY they were two
 * profiles — and a merge has since put them on one person. */
const MERGED_PAIR: NetworkCandidateRow[] = [
  row({
    id: "c-new",
    project_id: "p2",
    email: "rowan@meridian.test",
    current_title: "CFO",
    updated_at: "2026-09-20T00:00:00.000Z",
  }),
  row({
    id: "c-old",
    project_id: "p1",
    email: null,
    current_title: "Finance Director",
    updated_at: "2026-08-01T00:00:00.000Z",
  }),
];

describe("the fold asks which PERSON a row belongs to", () => {
  it("renders a merged person as ONE row holding both records", () => {
    const { people } = foldRowsIntoPeople(MERGED_PAIR, [], PROJECTS);

    expect(people).toHaveLength(1);
    expect(people[0].appearances.map((a) => a.candidate_id).sort()).toEqual([
      "c-new",
      "c-old",
    ]);
    // The rows genuinely disagree about identity — this fixture would be
    // two people under the old rule, and the test is worthless if it is not.
    expect(personKey({ ...MERGED_PAIR[0], network_profile_id: null })).not.toBe(
      personKey({ ...MERGED_PAIR[1], network_profile_id: null })
    );
  });

  it("keys the row on the profile, so the relationship overlay can join", () => {
    const { people } = foldRowsIntoPeople(MERGED_PAIR, [], PROJECTS);
    // The overlay is a map of network_profiles by id (profile-resolver).
    // Anything derived here is the bug this slice removed.
    expect(people[0].profile_id).toBe("np-rowan");
  });

  it("counts a merged person once across two mandates, as returning", () => {
    const { people } = foldRowsIntoPeople(MERGED_PAIR, [], PROJECTS);
    expect(people[0].returning).toBe(true);
    expect(people[0].appearances.map((a) => a.project_title).sort()).toEqual([
      "CFO Search",
      "COO Search",
    ]);
  });

  it("still lets the DOCUMENTS speak — newest record supplies the facts (D3)", () => {
    const { people } = foldRowsIntoPeople(MERGED_PAIR, [], PROJECTS);
    expect(people[0].full_name).toBe("Rowan Delacroix");
    expect(people[0].current_title).toBe("CFO");
    expect(people[0].email).toBe("rowan@meridian.test");
    expect(people[0].canonical_candidate_id).toBe("c-new");
  });

  it("keeps two genuinely different people apart", () => {
    const { people } = foldRowsIntoPeople(
      [
        row({ id: "a", network_profile_id: "np-a" }),
        row({ id: "b", network_profile_id: "np-b", full_name: "Someone Else" }),
      ],
      [],
      PROJECTS
    );
    expect(people).toHaveLength(2);
  });

  it("takes the best tier and best score across a merged person's records", () => {
    const scores: NetworkScoreRow[] = [
      {
        candidate_id: "c-new",
        project_id: "p2",
        rank_position: 3,
        overall_score: 61,
        tier: "tier_2",
      },
      {
        candidate_id: "c-old",
        project_id: "p1",
        rank_position: 1,
        overall_score: 74,
        tier: "tier_1",
      },
    ];
    const { people } = foldRowsIntoPeople(MERGED_PAIR, scores, PROJECTS);
    expect(people[0].best_score).toBe(74);
    expect(people[0].best_tier).toBe("tier_1");
  });
});

describe("a row with no person yet is held back, not folded (D2)", () => {
  const PENDING = row({
    id: "c-pending",
    full_name: "Konstantin Abramowicz CV Final.pdf",
    current_company: null,
    network_profile_id: null,
  });

  it("keeps it out of the table — §196/139: that is a filename, not a person", () => {
    const { people } = foldRowsIntoPeople([...MERGED_PAIR, PENDING], [], PROJECTS);
    expect(people).toHaveLength(1);
    expect(
      people.flatMap((p) => p.appearances.map((a) => a.candidate_id))
    ).not.toContain("c-pending");
  });

  it("SAYS how many are held back rather than dropping them silently", () => {
    const { people_pending } = foldRowsIntoPeople(
      [...MERGED_PAIR, PENDING, row({ id: "c-p2", network_profile_id: null })],
      [],
      PROJECTS
    );
    expect(people_pending).toBe(2);
  });

  it("does not invent a person for them by any other route", () => {
    const { people, people_pending } = foldRowsIntoPeople([PENDING], [], PROJECTS);
    expect(people).toEqual([]);
    expect(people_pending).toBe(1);
  });
});

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
