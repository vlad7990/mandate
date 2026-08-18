import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SAMPLE_ASSESSMENT,
  SAMPLE_ASSESSMENT_PROVENANCE,
  SAMPLE_EXECUTIVE_AUDIT,
  SAMPLE_INTERVIEW_PLAN,
  SAMPLE_LINKED_CANDIDATES,
  SAMPLE_OPERATIONAL_WEIGHTS,
  SAMPLE_PLAN_PROVENANCE,
  SAMPLE_PROFILE_PROVENANCE,
  SAMPLE_SEARCHES,
  SAMPLE_SEARCH_ID,
  SAMPLE_SUCCESS_PROFILE,
  SAMPLE_WEIGHT_RATIONALE,
  SAMPLE_WORKED_CANDIDATE_ID,
  sampleChain,
  sampleLinkedCandidate,
  sampleStageCounts,
  sampleWorkedSearch,
} from "./executive";
import {
  SAMPLE_CANDIDATES,
  SAMPLE_CLIENTS,
  SAMPLE_MANDATES,
  SAMPLE_PLACEMENTS,
  SAMPLE_PRIORITIES,
} from "./data";
import { compileExecutiveReport } from "@/lib/executive/report";
import { RATING_SCORES } from "@/lib/executive/assessment-scoring";

/**
 * What the executive-search sample is not allowed to get wrong.
 *
 * Two failures this file exists to catch, both of which have already
 * happened once in this project:
 *
 * 1. **Inventing vocabulary the product does not have.** W6 found the
 *    sample teaching five scoring dimensions that have nowhere to live in
 *    the schema. The shipped EI sample was doing the same thing with six
 *    competency names — "Partner-level influence", "Talent architecture" —
 *    none of which is in the catalogue that `/competencies` renders from
 *    the same module. Assertion (1) reads the seed migration and refuses
 *    any key that is not really there.
 *
 * 2. **Two screens describing the same thing and disagreeing.** The chain
 *    said "2 in diligence" while the header above it said "4 candidates in
 *    diligence"; the home page said the success profile was a v2 draft
 *    while the workspace said v3 approved. Everything countable is derived
 *    now, and the assertions below pin the derivations.
 */

/* Keys really seeded by 033, parsed rather than retyped. */
const SEED = fs.readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/033_executive_intelligence_seed.sql"),
  "utf8"
);

/** Competency rows in 033 are `('key', 'Name', 'category',` at line start. */
const SEEDED_COMPETENCIES = new Map<string, string>(
  [...SEED.matchAll(/^\s*\('([a-z_]+)',\s*'([^']*(?:''[^']*)*)',\s*'(?:leadership|functional|operating|governance)',/gm)].map(
    (m) => [m[1], m[2].replace(/''/g, "'")]
  )
);

describe("the sample's competencies are the product's competencies", () => {
  it("parsed the seed migration", () => {
    // Guards the regex: a seed format change must fail loudly here rather
    // than turn every assertion below into a vacuous pass.
    expect(SEEDED_COMPETENCIES.size).toBe(24);
  });

  it("uses only keys that are really seeded", () => {
    const unknown = SAMPLE_OPERATIONAL_WEIGHTS.filter(
      (w) => !SEEDED_COMPETENCIES.has(w.competency_key)
    ).map((w) => w.competency_key);
    expect(unknown).toEqual([]);
  });

  it("uses the catalogue's own label for each key", () => {
    // The library screen shows these names. A nicer paraphrase here would
    // teach a prospect a word they will not find when they click through.
    for (const w of SAMPLE_OPERATIONAL_WEIGHTS) {
      expect(w.label).toBe(SEEDED_COMPETENCIES.get(w.competency_key));
    }
  });
});

describe("the weights", () => {
  it("sum to 100", () => {
    const total = SAMPLE_OPERATIONAL_WEIGHTS.reduce((s, w) => s + w.weight, 0);
    expect(total).toBe(100);
  });

  it("are in descending weight order", () => {
    const weights = SAMPLE_OPERATIONAL_WEIGHTS.map((w) => w.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it("each carry a rationale", () => {
    for (const w of SAMPLE_OPERATIONAL_WEIGHTS) {
      expect(SAMPLE_WEIGHT_RATIONALE[w.competency_key]?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it("are the same set the approved profile recommends", () => {
    expect(
      SAMPLE_SUCCESS_PROFILE.recommended_competency_weights.map((r) => [
        r.competency_key,
        r.weight,
      ])
    ).toEqual(SAMPLE_OPERATIONAL_WEIGHTS.map((w) => [w.competency_key, w.weight]));
  });
});

describe("the interview plan", () => {
  const stageNames = SAMPLE_INTERVIEW_PLAN.stages.map((s) => s.stage_name);

  it("assigns only real competency keys", () => {
    const keys = new Set(SAMPLE_OPERATIONAL_WEIGHTS.map((w) => w.competency_key));
    const stray = SAMPLE_INTERVIEW_PLAN.stages
      .flatMap((s) => s.assigned_competencies)
      .filter((k) => !keys.has(k));
    expect(stray).toEqual([]);
  });

  it("covers every weighted competency", () => {
    const uncovered = SAMPLE_INTERVIEW_PLAN.competency_coverage
      .filter((c) => c.covered_by.length === 0)
      .map((c) => c.competency_key);
    expect(uncovered).toEqual([]);
  });

  it("reports coverage that matches its own stage assignments", () => {
    // The real generator computes this server-side. A fixture that typed it
    // could claim coverage the stages do not deliver.
    for (const entry of SAMPLE_INTERVIEW_PLAN.competency_coverage) {
      const expected = SAMPLE_INTERVIEW_PLAN.stages
        .filter((s) => s.assigned_competencies.includes(entry.competency_key))
        .map((s) => s.stage_name);
      expect(entry.covered_by).toEqual(expected);
    }
  });

  it("repeats no question anywhere in the plan", () => {
    // `dedupeQuestionsAcrossStages` enforces this on real output; a fixture
    // that violated it would render something the product cannot produce.
    const all = SAMPLE_INTERVIEW_PLAN.stages.flatMap((s) => [
      ...s.core_questions,
      ...s.follow_up_questions,
      ...s.candidate_specific_questions,
    ]);
    const norm = all.map((q) => q.trim().replace(/\s+/g, " ").toLowerCase());
    expect(new Set(norm).size).toBe(all.length);
  });

  it("names a role, never a person, as the interviewer", () => {
    const people = SAMPLE_LINKED_CANDIDATES.map((c) => c.name);
    for (const s of SAMPLE_INTERVIEW_PLAN.stages) {
      expect(s.recommended_interviewer_role.length).toBeGreaterThan(0);
      for (const name of people) {
        expect(s.recommended_interviewer_role).not.toContain(name);
      }
    }
  });

  it("keeps every stage inside the prompt's own length discipline", () => {
    expect(SAMPLE_INTERVIEW_PLAN.stages.length).toBeGreaterThanOrEqual(3);
    expect(SAMPLE_INTERVIEW_PLAN.stages.length).toBeLessThanOrEqual(6);
    for (const s of SAMPLE_INTERVIEW_PLAN.stages) {
      expect(s.core_questions.length).toBeGreaterThanOrEqual(3);
      expect(s.core_questions.length).toBeLessThanOrEqual(6);
      expect(s.follow_up_questions.length).toBeGreaterThanOrEqual(2);
      expect(s.follow_up_questions.length).toBeLessThanOrEqual(5);
      expect(s.candidate_specific_questions.length).toBeLessThanOrEqual(4);
      expect(s.evidence_to_listen_for.length).toBeGreaterThanOrEqual(3);
      expect(s.evidence_to_listen_for.length).toBeLessThanOrEqual(6);
      expect(s.weak_answer_indicators.length).toBeGreaterThanOrEqual(2);
      expect(s.weak_answer_indicators.length).toBeLessThanOrEqual(5);
      expect(s.red_flags.length).toBeGreaterThanOrEqual(1);
      expect(s.red_flags.length).toBeLessThanOrEqual(4);
      expect(s.duration_minutes).toBeGreaterThan(0);
    }
  });

  it("has stage names the assessment can actually cite", () => {
    // `compileExecutiveReport` filters `source_stages` against the approved
    // plan's stage names and silently drops the rest. The old hand-written
    // sample cited "stages 1, 3", which would have vanished from the report.
    const known = new Set(stageNames);
    const dangling = SAMPLE_ASSESSMENT.competency_assessments
      .flatMap((a) => a.source_stages)
      .filter((s) => !known.has(s));
    expect(dangling).toEqual([]);
  });
});

describe("the assessment", () => {
  it("rates every weighted competency and nothing else", () => {
    expect(
      SAMPLE_ASSESSMENT.competency_assessments.map((a) => a.competency_key).sort()
    ).toEqual(SAMPLE_OPERATIONAL_WEIGHTS.map((w) => w.competency_key).sort());
  });

  it("writes evidence for every rating", () => {
    // report.ts drops a rating with no written evidence from the narrative —
    // "a number without a reason". A fixture with one would render a coverage
    // row that section 03 never explains.
    for (const a of SAMPLE_ASSESSMENT.competency_assessments) {
      expect(a.evidence.trim().length).toBeGreaterThan(40);
      expect(a.source_stages.length).toBeGreaterThan(0);
    }
  });

  it("carries a server-computed rollup, not a typed one", () => {
    expect(SAMPLE_ASSESSMENT.evidence_rollup.map((e) => e.competency_key)).toEqual(
      SAMPLE_OPERATIONAL_WEIGHTS.map((w) => w.competency_key)
    );
    for (const entry of SAMPLE_ASSESSMENT.evidence_rollup) {
      expect(entry.evidence_score).toBe(RATING_SCORES[entry.rating]);
    }
  });

  it("states no verdict about the person", () => {
    // The one screen in this module carrying an evaluative judgement is the
    // one with no agent behind it, and it is still bound by CLAUDE.md.
    //
    // Matched as phrases, not as words. The first version of this assertion
    // banned the bare substring "hire" and failed on *"acting slowly on a
    // hire that was not working"* — a sentence about the candidate's own
    // management record, which is exactly the kind of evidence this screen
    // exists to hold. A guard that cannot tell a verdict from its vocabulary
    // fails on good content and would have been silenced rather than fixed.
    const prose = [
      SAMPLE_ASSESSMENT.overall_summary,
      ...SAMPLE_ASSESSMENT.competency_assessments.map((a) => a.evidence),
    ]
      .join(" ")
      .toLowerCase();

    const verdicts = [
      /\b(do not|don't|should not|would not)\s+(hire|appoint|advance|proceed)/,
      /\brecommend(s|ed)?\s+(hiring|appointing|rejecting|advancing|against)/,
      /\b(hire|appoint|reject|decline)\s+(him|her|them|this candidate)/,
      /\b(not|no)\s+a\s+(fit|match)\b/,
      /\bculture fit\b/,
      /\b(personality|temperament|attitude problem|coachab\w+)\b/,
    ];
    for (const pattern of verdicts) {
      expect(prose).not.toMatch(pattern);
    }
  });
});

describe("the searches", () => {
  it("contains the worked search", () => {
    expect(sampleWorkedSearch().id).toBe(SAMPLE_SEARCH_ID);
  });

  it("has unique sample ids", () => {
    const ids = SAMPLE_SEARCHES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("sample-")).toBe(true);
  });

  it("agrees with the mandate list about the same company", () => {
    // A prospect who opens Mandates and Executive Intelligence must land on
    // one world, not two. `sample-northvale` is the same engagement.
    const mandate = SAMPLE_MANDATES.find((m) => m.id === "sample-northvale");
    expect(mandate).toBeDefined();
    expect(sampleWorkedSearch().companyName).toBe(mandate?.company);
    expect(sampleWorkedSearch().roleTitle).toBe(mandate?.title);
  });

  it("states a linked count equal to the linked candidates", () => {
    expect(sampleWorkedSearch().candidatesLinked).toBe(
      SAMPLE_LINKED_CANDIDATES.length
    );
  });

  it("states the profile version the provenance block states", () => {
    expect(sampleWorkedSearch().profileVersion).toBe(
      SAMPLE_PROFILE_PROVENANCE.version
    );
    expect(sampleWorkedSearch().profileApproved).toBe(true);
  });

  it("keeps exactly one search whose profile is a draft awaiting approval", () => {
    // The home page's priority card names it. Two would make the card
    // ambiguous; none would make it a lie.
    const drafts = SAMPLE_SEARCHES.filter(
      (s) => s.profileVersion !== null && !s.profileApproved
    );
    expect(drafts).toHaveLength(1);
  });

  it("is described accurately by the home page's priority card", () => {
    // The card used to name Northvale at v2 while the workspace showed
    // that profile approved at v3. Whatever it names has to still be a
    // draft, at the version the card claims.
    const card = SAMPLE_PRIORITIES.find((p) => p.id === "sample-priority-profile");
    expect(card).toBeDefined();

    const named = SAMPLE_SEARCHES.filter(
      (s) =>
        card!.detail.includes(s.companyName) && card!.detail.includes(s.roleTitle)
    );
    expect(named).toHaveLength(1);
    expect(named[0].profileApproved).toBe(false);
    expect(card!.detail).toContain(`v${named[0].profileVersion}`);
  });
});

describe("a live search never has its own placement already booked", () => {
  it("fills no seat that a mandate is still open on", () => {
    /*
      `SAMPLE_PLACEMENTS` used to record two people as *started* in seats
      the sample still has live searches for: Daniel Okonjo as COO at
      Northvale, and Priya Anand as CTO at Larkspur — the mandate W3–W6 is
      entirely built on, and the one W7's shortlist screen submits her as a
      candidate for. The revenue screen was billing searches the portfolio
      and shortlist screens were still running.

      **`STARTED` only, and that is the whole precision of the rule.**
      Cindermere carries a `FELL THROUGH` placement and an `ACCEPTED` one
      against its live VP Engineering search, and both are correct: a
      fallthrough is exactly what reopens a search, and it is in the
      fixture on purpose to exercise the reversal ledger. Only a start
      means the seat is filled.
    */
    const open = new Set(
      SAMPLE_MANDATES.map((m) => `${m.title}@${m.company}`.toLowerCase())
    );
    const clashes = SAMPLE_PLACEMENTS.filter(
      (p) =>
        p.status === "STARTED" &&
        open.has(`${p.mandate}@${p.client}`.toLowerCase())
    ).map((p) => `${p.candidate} — ${p.mandate} @ ${p.client}`);

    expect(clashes).toEqual([]);
  });

  it("places people against searches their client has actually closed", () => {
    // A started placement is the end of a search, so the client has to be
    // able to name it among its closed mandates. This is what caught the
    // Larkspur row: its two closures were 214 and 402 days old and the
    // placement paying this quarter's revenue matched neither.
    const started = SAMPLE_PLACEMENTS.filter((p) => p.status === "STARTED");
    expect(started.length).toBeGreaterThan(0);

    for (const p of started) {
      const client = SAMPLE_CLIENTS.find((c) => c.name === p.client);
      expect(client, `no client named ${p.client}`).toBeDefined();
      expect(
        client!.closedMandates.map((m) => m.title),
        `${p.client} has no closed mandate for ${p.mandate}`
      ).toContain(p.mandate);
    }
  });

  it("never places a candidate the executive search still has in diligence", () => {
    const inDiligence = new Set(
      SAMPLE_LINKED_CANDIDATES.map((c) => c.name.toLowerCase())
    );
    const placed = SAMPLE_PLACEMENTS.filter((p) =>
      inDiligence.has(p.candidate.toLowerCase())
    ).map((p) => p.candidate);

    expect(placed).toEqual([]);
  });
});

describe("the linked candidates", () => {
  it("contains the worked candidate", () => {
    expect(sampleLinkedCandidate(SAMPLE_WORKED_CANDIDATE_ID)).toBeDefined();
  });

  it("draws from the organisation's own candidate pool", () => {
    // The workspace says "linked from the organisation pool". Okonjo is
    // `sample-okonjo` in SAMPLE_CANDIDATES and appears in SAMPLE_NETWORK
    // against this search, so the claim has to stay true.
    const worked = sampleLinkedCandidate(SAMPLE_WORKED_CANDIDATE_ID);
    const pooled = SAMPLE_CANDIDATES.find((c) => c.id === SAMPLE_WORKED_CANDIDATE_ID);
    expect(pooled).toBeDefined();
    expect(worked?.name).toBe(pooled?.name);
  });

  it("gives an assessment only to a candidate whose plan is approved", () => {
    // The product's own gate: assessments open once the plan is approved.
    for (const c of SAMPLE_LINKED_CANDIDATES) {
      if (c.assessmentStatus !== "none") expect(c.planStatus).toBe("approved");
    }
  });

  it("has exactly one candidate with the full chain behind them", () => {
    const complete = SAMPLE_LINKED_CANDIDATES.filter(
      (c) => c.assessmentStatus === "approved"
    );
    expect(complete.map((c) => c.id)).toEqual([SAMPLE_WORKED_CANDIDATE_ID]);
  });
});

describe("the chain never contradicts the panels below it", () => {
  const chain = sampleChain();
  const counts = sampleStageCounts();

  it("counts the candidates that exist", () => {
    const step = chain.find((s) => s.label === "Candidates");
    expect(step?.badge).toBe(`${SAMPLE_LINKED_CANDIDATES.length} linked`);
    expect(step?.detail).toContain(`${counts.in_diligence} in diligence`);
    expect(step?.detail).toContain(`${counts.advanced} advanced`);
  });

  it("counts the plans that exist", () => {
    const approved = SAMPLE_LINKED_CANDIDATES.filter(
      (c) => c.planStatus === "approved"
    ).length;
    const step = chain.find((s) => s.label === "Interview plans");
    expect(step?.detail).toContain(`${approved} approved`);
  });

  it("states the approved profile version", () => {
    const step = chain.find((s) => s.label === "Success profile");
    expect(step?.detail).toContain(`v${SAMPLE_PROFILE_PROVENANCE.version}`);
  });

  it("sums the stage counts to the linked candidates", () => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(SAMPLE_LINKED_CANDIDATES.length);
  });
});

describe("the audit trail", () => {
  it("is newest first", () => {
    const days = SAMPLE_EXECUTIVE_AUDIT.map((a) => a.daysAgo);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it("records the approvals the provenance blocks claim", () => {
    const at = (type: string) =>
      SAMPLE_EXECUTIVE_AUDIT.find((a) => a.eventType === type)?.daysAgo;
    expect(at("profile_approved")).toBe(SAMPLE_PROFILE_PROVENANCE.approvedDaysAgo);
    expect(at("interview_plan_approved")).toBe(SAMPLE_PLAN_PROVENANCE.approvedDaysAgo);
    expect(at("assessment_approved")).toBe(
      SAMPLE_ASSESSMENT_PROVENANCE.approvedDaysAgo
    );
  });

  it("dates every link event from the candidate's own row", () => {
    // Typed separately, these drifted within a day of being written: the
    // trail put Rachel Sowande's link on day 30 and her candidate row put
    // it on day 23. Caught by reading the page, not by a test — so now
    // there is one.
    for (const c of SAMPLE_LINKED_CANDIDATES) {
      const event = SAMPLE_EXECUTIVE_AUDIT.find(
        (a) => a.eventType === "candidate_linked" && a.detail === c.name
      );
      expect(event, `no link event for ${c.name}`).toBeDefined();
      expect(event!.daysAgo).toBe(c.linkedDaysAgo);
    }
  });

  it("links every candidate before anything is approved for them", () => {
    const linkedAt = new Map(
      SAMPLE_LINKED_CANDIDATES.map((c) => [c.name, c.linkedDaysAgo])
    );
    for (const a of SAMPLE_EXECUTIVE_AUDIT) {
      const subject = [...linkedAt.keys()].find((n) => a.detail.startsWith(n));
      if (!subject || a.eventType === "candidate_linked") continue;
      // Higher daysAgo is earlier: nothing may happen to a candidate before
      // they were linked to the search.
      expect(
        a.daysAgo,
        `${a.eventType} for ${subject} predates their link`
      ).toBeLessThanOrEqual(linkedAt.get(subject)!);
    }
  });

  it("never approves an artifact before the one it depends on", () => {
    // Profile → plan → assessment. Higher daysAgo is earlier.
    expect(SAMPLE_PROFILE_PROVENANCE.approvedDaysAgo).toBeGreaterThan(
      SAMPLE_PLAN_PROVENANCE.approvedDaysAgo
    );
    expect(SAMPLE_PLAN_PROVENANCE.approvedDaysAgo).toBeGreaterThan(
      SAMPLE_ASSESSMENT_PROVENANCE.approvedDaysAgo
    );
  });
});

describe("the report the product would compile from this fixture", () => {
  const report = compileExecutiveReport({
    candidateName: "Daniel Okonjo",
    roleTitle: sampleWorkedSearch().roleTitle,
    companyName: sampleWorkedSearch().companyName,
    profile: {
      version: SAMPLE_PROFILE_PROVENANCE.version,
      approvedAt: "2026-07-20T14:26:00Z",
      approverName: SAMPLE_PROFILE_PROVENANCE.approvedByName,
      roleMission: SAMPLE_SUCCESS_PROFILE.role_mission,
      strategicMandate: SAMPLE_SUCCESS_PROFILE.strategic_mandate,
    },
    plan: {
      version: SAMPLE_PLAN_PROVENANCE.version,
      approvedAt: "2026-08-01T09:00:00Z",
      approverName: SAMPLE_PLAN_PROVENANCE.approvedByName,
      stageNames: SAMPLE_INTERVIEW_PLAN.stages.map((s) => s.stage_name),
    },
    assessment: {
      version: SAMPLE_ASSESSMENT_PROVENANCE.version,
      approvedAt: "2026-08-05T11:00:00Z",
      approverName: SAMPLE_ASSESSMENT_PROVENANCE.approvedByName,
      content: SAMPLE_ASSESSMENT,
    },
    weights: SAMPLE_OPERATIONAL_WEIGHTS,
  });

  it("shows no drift between the assessment and the current weights", () => {
    expect(report.weightsDrifted).toBe(false);
  });

  it("explains every coverage row it draws", () => {
    // Section 02 draws six rows; section 03 must account for all six.
    expect(report.coverage).toHaveLength(SAMPLE_OPERATIONAL_WEIGHTS.length);
    expect(report.evidence).toHaveLength(SAMPLE_OPERATIONAL_WEIGHTS.length);
  });

  it("cites only stages that exist on the approved plan", () => {
    const known = new Set(SAMPLE_INTERVIEW_PLAN.stages.map((s) => s.stage_name));
    for (const e of report.evidence) {
      expect(e.sourceStages.length).toBeGreaterThan(0);
      for (const s of e.sourceStages) expect(known.has(s)).toBe(true);
    }
  });

  it("reports full weight coverage and a strength below it", () => {
    // The two figures are different questions and the sample must not let
    // them read as one: everything has *some* evidence (100% of weight),
    // and the weighted strength of that evidence is lower.
    expect(report.coveredCount).toBe(SAMPLE_OPERATIONAL_WEIGHTS.length);
    expect(report.coveredWeightPercent).toBe(100);
    expect(report.weightedStrengthPercent).toBeLessThan(100);
    expect(report.weightedStrengthPercent).toBeGreaterThan(0);
  });

  it("names its thin evidence rather than closing it by inference", () => {
    const thin = report.thinParagraphs.join(" ");
    expect(thin).toContain("Technology Strategy");
    expect(thin).toContain("will not close them by inference");
  });

  it("declares the assessment as human-authored", () => {
    expect(report.provenance).toContain("Assessment authored by a human · no AI");
  });
});
