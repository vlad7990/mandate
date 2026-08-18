import Link from "next/link";
import { IconInfo } from "@/components/icons";
import {
  EI_BASE,
  EiChainGate,
  EiHeader,
  EiPanel,
  EiProvenance,
  EiReadOnlyNote,
  eiDayOf,
} from "@/components/sample/sample-ei-shell";
import {
  SAMPLE_ASSESSMENT,
  SAMPLE_ASSESSMENT_PROVENANCE,
  SAMPLE_WORKED_CANDIDATE_ID,
  sampleLinkedCandidate,
  sampleWorkedSearch,
} from "@/lib/sample";
import {
  ASSESSMENT_DISCLAIMER,
  EVIDENCE_RATING_LABELS,
  type EvidenceRating,
} from "@/lib/executive/types";

/**
 * The assessment — evidence recorded against the approved competency
 * weights, authored by a person.
 *
 * ## The inventory had this one exactly backwards
 *
 * `.../assessment` was listed `generated` and blocked on D1, which reads
 * as the single most sensitive screen in the product: an AI's evaluative
 * judgement of a named individual.
 *
 * **There is no agent.** `assessment/actions.ts` imports
 * `buildAssessmentSkeleton`, `applyRollup` and `normalizeAssessment` from
 * `executive-assessment.ts`, which contains no model call of any kind.
 * `types.ts` says so above `AssessmentRow` — *"No AI provenance columns:
 * there is no agent"* — the module ships its own `ASSESSMENT_DISCLAIMER`
 * separate from the decision-support one precisely because the record is a
 * human's, and every compiled report prints *"Assessment authored by a
 * human · no AI"* into its provenance.
 *
 * So the one screen in this module carrying an evaluative judgement of a
 * person is the one screen with no AI in it at all. The classification was
 * read off the layout rather than the imports.
 *
 * ## What it may still say
 *
 * No agent does not mean no rules — CLAUDE.md binds every surface. The
 * scale is deliberately evidence-oriented rather than a grade
 * (`EvidenceRating` is commented as such), the rollup is computed
 * server-side so a client cannot forge it, and the fixture's prose records
 * what an interviewer observed in an answer. `executive.test.ts` asserts
 * the absence of verdict phrasing.
 *
 * The number is the honest one: `weighted_evidence_strength` is a measure
 * of how much evidence was gathered, and this screen says so beside it
 * rather than letting it read as a score out of a hundred.
 */

const RATING_TONE: Record<EvidenceRating, string> = {
  strong: "text-primary",
  moderate: "text-on-surface-variant",
  limited: "text-outline",
  none: "text-outline",
};

export function SampleEiAssessment({ candidateId }: { candidateId: string }) {
  const search = sampleWorkedSearch();
  const candidate = sampleLinkedCandidate(candidateId);
  const crumbs = [
    { label: "Executive Intelligence", href: "/app/executive-intelligence" },
    { label: search.companyName, href: EI_BASE },
    { label: "Candidates", href: `${EI_BASE}/candidates` },
    { label: "Assessment" },
  ];

  if (!candidate) {
    return (
      <EiChainGate
        title="Assessment"
        crumbs={crumbs}
        candidateName="This candidate"
        artifact="assessment"
        reason="This candidate is not linked to the sample search."
        unlocks="An assessment opens for a candidate once their interview plan is approved."
      />
    );
  }

  if (candidateId !== SAMPLE_WORKED_CANDIDATE_ID) {
    const gated = candidate.planStatus !== "approved";
    return (
      <EiChainGate
        title="Assessment"
        crumbs={crumbs}
        candidateName={candidate.name}
        artifact="assessment"
        reason={
          gated
            ? `${candidate.name}'s interview plan is not approved, so the assessment is not open yet.`
            : `No assessment has been started for ${candidate.name}. Their interview plan is approved, so it is available.`
        }
        unlocks={
          gated
            ? "Approving the interview plan unlocks the assessment for this candidate. The gate is the product's, not the sample's."
            : "An assessment is written by a person against the approved competency weights. No agent drafts it."
        }
      />
    );
  }

  const a = SAMPLE_ASSESSMENT;
  const strengthPercent = Math.round(a.weighted_evidence_strength * 100);

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <EiHeader
        title="Assessment"
        crumbs={crumbs}
        meta={[
          candidate.name,
          `${search.roleTitle} · ${search.companyName}`,
          `v${SAMPLE_ASSESSMENT_PROVENANCE.version} approved`,
        ]}
        status={
          <span className="bg-primary/20 px-2.5 py-1.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
            Approved · read-only
          </span>
        }
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* The module's own disclaimer, not the decision-support one —
              they are different sentences because this artifact has no
              agent behind it. */}
          <div className="flex items-start gap-3 border border-outline-variant bg-surface-container-low p-4">
            <IconInfo size={15} className="mt-0.5 shrink-0 text-outline" />
            <p className="text-[13px] leading-relaxed text-outline">
              {ASSESSMENT_DISCLAIMER}
            </p>
          </div>

          <EiPanel
            title="Assessor summary"
            meta={
              <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                Written by {SAMPLE_ASSESSMENT_PROVENANCE.approvedByName}
              </span>
            }
          >
            <p className="max-w-[70ch] px-5 py-5 text-[16px] leading-[1.75] text-on-surface-variant">
              {a.overall_summary}
            </p>
          </EiPanel>

          <EiPanel
            title="Evidence by competency"
            meta={
              <span className="font-mono-label text-[11px] uppercase tracking-wider text-outline">
                A rating never travels without what was observed
              </span>
            }
          >
            <ul className="divide-y divide-outline-variant/40">
              {a.evidence_rollup.map((entry) => {
                const written = a.competency_assessments.find(
                  (x) => x.competency_key === entry.competency_key
                );
                return (
                  <li
                    key={entry.competency_key}
                    className="flex flex-col gap-2.5 px-5 py-4"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                      <p className="min-w-0 flex-1 basis-[200px] text-[15px] font-semibold leading-snug text-on-surface">
                        {entry.label}
                      </p>
                      <span className="font-mono-data shrink-0 text-xs tabular-nums text-outline">
                        {entry.weight}% weight
                      </span>
                      <span
                        className={`shrink-0 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] ${
                          RATING_TONE[entry.rating]
                        }`}
                      >
                        {EVIDENCE_RATING_LABELS[entry.rating]}
                      </span>
                    </div>

                    {written && (
                      <>
                        <p className="max-w-[72ch] text-[14px] leading-[1.75] text-on-surface-variant">
                          {written.evidence}
                        </p>
                        <p className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-outline">
                          Observed in {written.source_stages.join(" · ")}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </EiPanel>
        </div>

        <div className="flex flex-col gap-5">
          <EiPanel
            title="Weighted evidence strength"
            meta={
              <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                Server-computed
              </span>
            }
          >
            <div className="px-5 py-5">
              <p className="font-heading text-[34px] leading-none tabular-nums text-on-surface">
                {strengthPercent}%
              </p>
              {/* What the number is, immediately beneath it. Without this
                  line it reads as a mark out of a hundred, which is the
                  one thing it is not. */}
              <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">
                How much of the weighted competency set has evidence recorded
                against it, scored by how much each competency holds.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-outline">
                It is a measure of this assessment&apos;s coverage, not of the
                person, and it does not make the decision. A competency left
                blank counts as no evidence, so the figure cannot be raised by
                skipping one.
              </p>
            </div>
          </EiPanel>

          <EiPanel title="The scale">
            <ul className="flex flex-col gap-2 px-5 py-4">
              {(
                Object.entries(EVIDENCE_RATING_LABELS) as [EvidenceRating, string][]
              ).map(([key, label]) => (
                <li
                  key={key}
                  className={`text-[13px] leading-relaxed ${RATING_TONE[key]}`}
                >
                  {label}
                </li>
              ))}
            </ul>
            <p className="border-t border-outline-variant/60 px-5 py-3.5 text-xs leading-relaxed text-outline">
              Four levels, deliberately coarse. False precision would
              misrepresent a human judgment.
            </p>
          </EiPanel>

          <div className="border border-outline-variant bg-surface-container-low">
            <EiProvenance
              items={[
                `approved day ${eiDayOf(SAMPLE_ASSESSMENT_PROVENANCE.approvedDaysAgo)}`,
                `by ${SAMPLE_ASSESSMENT_PROVENANCE.approvedByName}`,
                `version ${SAMPLE_ASSESSMENT_PROVENANCE.version}`,
                "authored by a human · no AI",
              ]}
            />
          </div>

          <Link
            href={`${EI_BASE}/candidates/${candidateId}/report`}
            prefetch={false}
            className="border border-outline-variant bg-surface-container-low px-5 py-3.5 text-center font-mono-label text-[11px] uppercase tracking-widest text-primary transition-colors hover:bg-surface-container"
          >
            Open the compiled report {"→"}
          </Link>

          <EiReadOnlyNote what="assessment" />
        </div>
      </div>
    </div>
  );
}
