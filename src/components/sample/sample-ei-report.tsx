import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconInfo } from "@/components/icons";
import { compileExecutiveReport } from "@/lib/executive/report";
import {
  SAMPLE_ASSESSMENT,
  SAMPLE_ASSESSMENT_PROVENANCE,
  SAMPLE_INTERVIEW_PLAN,
  SAMPLE_OPERATIONAL_WEIGHTS,
  SAMPLE_PLAN_PROVENANCE,
  SAMPLE_PROFILE_PROVENANCE,
  SAMPLE_SUCCESS_PROFILE,
  SAMPLE_WORKED_CANDIDATE_ID,
  sampleLinkedCandidate,
  sampleWorkedSearch,
} from "@/lib/sample";

/**
 * The Executive Intelligence report — comp 12.
 *
 * The artifact the whole chain builds toward, and the one where getting
 * the register wrong does real harm. Three rules from the comp:
 *
 * - **No grades, no percentiles.** Coverage is stated as a share of
 *   weighted competencies that have evidence recorded. The four levels
 *   are words — Strong, Moderate, Limited, No evidence observed — never
 *   letters and never a red-to-green ramp. The bars show recorded
 *   evidence against weight; they are not a quality gradient and carry
 *   no pass mark.
 * - **Thinness is a section.** Section 04 exists so the gaps are as
 *   prominent as the strengths. The report argues against its own
 *   completeness, which is the only honest thing a document like this
 *   can do.
 * - **Prints as itself.** The document column is the print layout — a
 *   780px measure with the provenance block as the footer. Exporting
 *   changes the paper, not the document.
 *
 * The first line states what the report is not. That is a product rule,
 * not a design flourish: no hiring recommendation, no score of the
 * person, no inference beyond what an interviewer wrote down.
 *
 * ## Why nothing below is written here
 *
 * This screen used to hand-write its coverage table, its thin-evidence
 * paragraph and its provenance block. Somebody had transcribed the output
 * of `buildThinParagraphs` into a string literal, and the numbers beside
 * it were typed.
 *
 * It now runs the fixture through **`compileExecutiveReport` — the same
 * function the real report uses** — so the sample cannot state a figure
 * the product would compute differently, and a change to the compiler
 * shows up here the day it lands. Three things the hand-written version
 * had already got wrong and this cannot:
 *
 * - It cited evidence as coming from *"stages 1, 3"*. The compiler filters
 *   `source_stages` against the approved plan's stage **names** and drops
 *   anything else, so those citations would have rendered as nothing.
 * - It omitted `weightedStrengthPercent` entirely, which the real report
 *   shows beside the coverage figure. The two answer different questions
 *   and the document is weaker for having only one.
 * - Its six competencies were invented names absent from the catalogue —
 *   see the header of `src/lib/sample/executive.ts`.
 */

/** ISO date `n` days back — the fixture stores day counts, never dates. */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function SectionHeading({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <h2 className="font-mono-label text-[13px] font-semibold uppercase tracking-[0.12em] text-outline">
      {n} — {children}
    </h2>
  );
}

export function SampleEiReport({ searchId }: { searchId: string }) {
  const search = sampleWorkedSearch();
  const candidate = sampleLinkedCandidate(SAMPLE_WORKED_CANDIDATE_ID);

  const report = compileExecutiveReport({
    candidateName: candidate?.name ?? "",
    roleTitle: search.roleTitle,
    companyName: search.companyName,
    profile: {
      version: SAMPLE_PROFILE_PROVENANCE.version,
      approvedAt: isoDaysAgo(SAMPLE_PROFILE_PROVENANCE.approvedDaysAgo),
      approverName: SAMPLE_PROFILE_PROVENANCE.approvedByName,
      roleMission: SAMPLE_SUCCESS_PROFILE.role_mission,
      strategicMandate: SAMPLE_SUCCESS_PROFILE.strategic_mandate,
    },
    plan: {
      version: SAMPLE_PLAN_PROVENANCE.version,
      approvedAt: isoDaysAgo(SAMPLE_PLAN_PROVENANCE.approvedDaysAgo),
      approverName: SAMPLE_PLAN_PROVENANCE.approvedByName,
      stageNames: SAMPLE_INTERVIEW_PLAN.stages.map((s) => s.stage_name),
    },
    assessment: {
      version: SAMPLE_ASSESSMENT_PROVENANCE.version,
      approvedAt: isoDaysAgo(SAMPLE_ASSESSMENT_PROVENANCE.approvedDaysAgo),
      approverName: SAMPLE_ASSESSMENT_PROVENANCE.approvedByName,
      content: SAMPLE_ASSESSMENT,
    },
    weights: SAMPLE_OPERATIONAL_WEIGHTS,
  });

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <SetBreadcrumbs
        crumbs={[
          { label: "Executive Intelligence", href: "/app/executive-intelligence" },
          {
            label: report.companyName,
            href: `/app/executive-intelligence/searches/${searchId}`,
          },
          { label: "Report" },
        ]}
      />

      <div className="print:hidden">
        <SampleBanner scope="report" />
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/*
          The document column IS the print layout. 780px measure, and the
          provenance block closes it as a footer. Nothing about export
          re-lays it out.
        */}
        <article className="mx-auto w-full max-w-[780px] border border-outline-variant bg-surface-container-low px-8 py-10 sm:px-16 sm:py-12 print:max-w-none print:border-0 print:px-0">
          <header className="flex flex-col gap-4 border-b border-outline-variant/60 pb-7">
            <p className="font-heading text-[11px] font-bold uppercase tracking-[0.14em] text-outline">
              Mandate · Executive Intelligence {"// sample data"}
            </p>
            <h1 className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-on-surface">
              {report.candidateName}
            </h1>
            <p className="text-[15px] leading-relaxed text-on-surface-variant">
              {report.roleTitle} · {report.companyName} · diligence complete
            </p>

            {/* What it is not, before anything it is. */}
            <div className="flex items-start gap-3 border border-outline-variant p-4">
              <IconInfo size={15} className="mt-0.5 shrink-0 text-outline" />
              <p className="text-[13px] leading-relaxed text-outline">
                This report records evidence gathered against an approved
                success profile. It contains no hiring recommendation, no score
                of the person, and no inference beyond what an interviewer
                wrote down.
              </p>
            </div>
          </header>

          <section className="mt-8 flex flex-col gap-3.5">
            <SectionHeading n="01">What the role requires</SectionHeading>
            {report.mandateParagraphs.map((p) => (
              <p key={p} className="text-[17px] leading-[1.75] text-on-surface">
                {p}
              </p>
            ))}
            <p className="text-[13px] leading-relaxed text-outline">
              {report.competencyCount} competencies were weighted and approved
              before any candidate was assessed.
            </p>
          </section>

          <section className="mt-8 flex flex-col gap-4">
            <SectionHeading n="02">Evidence coverage</SectionHeading>
            <p className="text-[15px] leading-[1.7] text-on-surface-variant">
              How much of the role&apos;s weighted competency set has supporting
              evidence recorded from the interview stages. Computed by the
              application from the approved assessment.{" "}
              <span className="text-outline">
                This is a measure of coverage, not of the candidate.
              </span>
            </p>

            {/* Surfaced, never hidden — the compiler reports it and so must
                the sample, or the sample is not showing the product. */}
            {report.weightsDrifted && (
              <p className="border border-outline-variant bg-surface-container px-4 py-3 text-[13px] leading-relaxed text-on-surface-variant">
                The search&apos;s competency weights have changed since this
                assessment was approved. Coverage below is recomputed against
                the current weights.
              </p>
            )}

            <div className="overflow-hidden border border-outline-variant bg-surface-container">
              <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2 border-b border-outline-variant/60 px-5 py-4">
                <span className="font-heading text-[30px] leading-none tabular-nums text-on-surface">
                  {report.coveredWeightPercent}%
                </span>
                <span className="text-sm leading-relaxed text-on-surface-variant">
                  of weighted competencies have evidence recorded ·{" "}
                  <span className="tabular-nums">
                    {report.coveredCount} of {report.competencyCount}
                  </span>
                </span>
                {/*
                  The second figure. Different question from the first: how
                  much of the weight is *covered* versus how strong the
                  recorded evidence is. Showing only the first flatters the
                  document.
                */}
                <span className="w-full text-[13px] leading-relaxed text-outline">
                  Weighted evidence strength{" "}
                  <span className="tabular-nums text-on-surface-variant">
                    {report.weightedStrengthPercent}%
                  </span>{" "}
                  — the same set scored by how much evidence each competency
                  actually holds.
                </span>
              </div>

              <ul className="flex flex-col gap-3.5 px-5 py-4">
                {report.coverage.map((c) => (
                  <li
                    key={c.competencyKey}
                    className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5"
                  >
                    <span className="w-full text-[13px] leading-snug text-on-surface-variant sm:w-[230px]">
                      {c.label}
                    </span>
                    <span className="w-10 shrink-0 font-mono-data text-xs tabular-nums text-outline">
                      {c.weightShare}%
                    </span>
                    {/* One hue at two weights — never a quality gradient. */}
                    <span
                      aria-hidden
                      className="h-1.5 min-w-[60px] flex-1 overflow-hidden bg-surface-container-high"
                    >
                      <span
                        className={`block h-full ${
                          c.rating === "strong" ? "bg-primary" : "bg-outline"
                        }`}
                        style={{ width: `${c.fill}%` }}
                      />
                    </span>
                    <span className="w-[76px] shrink-0 text-right text-xs text-on-surface-variant">
                      {c.ratingWord}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="border-t border-outline-variant/60 px-5 py-3.5 text-xs leading-relaxed text-outline">
                Four levels are used throughout: Strong · Moderate · Limited ·
                No evidence observed. Bars show recorded evidence against
                weight — they are not a quality gradient and carry no pass
                mark.
              </p>
            </div>
          </section>

          <section className="mt-8 flex flex-col gap-4">
            <SectionHeading n="03">Evidence recorded</SectionHeading>
            {report.assessorSummary && (
              <p className="text-[15px] leading-[1.75] text-on-surface-variant">
                {report.assessorSummary}
              </p>
            )}
            {report.evidence.map((e) => (
              <div
                key={e.competencyKey}
                className="flex flex-col gap-2 border-l-2 border-outline-variant pl-5"
              >
                <p className="font-heading text-[15px] font-semibold leading-snug text-on-surface">
                  {e.label}
                </p>
                <p className="font-mono-label text-[11px] uppercase text-outline">
                  {e.ratingWord}
                  {e.sourceStages.length > 0 && ` · ${e.sourceStages.join(", ")}`}
                  {report.recordedBy && ` · recorded by ${report.recordedBy}`}
                </p>
                <p className="mt-1 text-[15px] leading-[1.75] text-on-surface-variant">
                  {e.body}
                </p>
              </div>
            ))}
          </section>

          {/*
            Section 04 is the point of the document. The gaps get the same
            weight as the strengths, and the report refuses to close them
            by inference. Assembled by the compiler from the rollup — the
            report must not be able to argue its own gaps away.
          */}
          <section className="mt-8 flex flex-col gap-3.5">
            <SectionHeading n="04">Where evidence is thin</SectionHeading>
            {report.thinParagraphs.map((p) => (
              <p key={p} className="text-[15px] leading-[1.75] text-on-surface-variant">
                {p}
              </p>
            ))}
          </section>

          <footer className="mt-8 border-t border-outline-variant/60 pt-6">
            <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              Provenance
            </p>
            <div className="mt-2.5 grid gap-x-6 gap-y-1.5 font-mono-label text-[11px] leading-[1.7] uppercase text-outline sm:grid-cols-2">
              {report.provenance.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>
          </footer>
        </article>

        <aside className="flex flex-col gap-5 print:hidden">
          <div>
            <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              Status
            </p>
            <span className="mt-2.5 inline-block bg-primary/20 px-2.5 py-1.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
              Compiled from approved records
            </span>
            <p className="mt-2.5 text-xs leading-relaxed text-outline">
              Regenerating produces the same document unless an underlying
              artifact is re-approved at a new version.
            </p>
          </div>

          <div className="border-t border-outline-variant/60 pt-5">
            <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              Sections
            </p>
            <ol className="mt-2.5 flex flex-col gap-2 text-[13px] leading-relaxed text-on-surface-variant">
              <li>01 What the role requires</li>
              <li>02 Evidence coverage</li>
              <li>03 Evidence recorded</li>
              <li>04 Where evidence is thin</li>
            </ol>
          </div>

          <p className="mt-auto border-t border-outline-variant/60 pt-5 text-[11px] leading-relaxed text-outline">
            This is a sample report, so there is nothing to export or share.{" "}
            <Link
              href="/app/executive-intelligence"
              className="text-primary hover:underline"
            >
              Open a real executive search
            </Link>
            .
          </p>
        </aside>
      </div>
    </div>
  );
}
