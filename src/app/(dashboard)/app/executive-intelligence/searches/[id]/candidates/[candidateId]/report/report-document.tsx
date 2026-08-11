import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { IconInfo } from "@/components/icons";
import type { CompiledReport } from "@/lib/executive/report";
import { PrintReportButton } from "./print-button";

/**
 * The Executive Intelligence report — comp 12, compiled from approved
 * records. The sample at `src/components/sample/sample-ei-report.tsx` is the
 * design; this is the same document with the fixtures removed.
 *
 * The three rules the sample records still bind, and they bind harder here
 * because this copy goes to a client:
 *
 * - **No grades, no percentiles.** Coverage is the share of the role's
 *   competency weight that has evidence recorded. The four levels are words.
 *   The bars show recorded evidence against weight — not a quality gradient,
 *   no pass mark, no red-to-green ramp.
 * - **Thinness is a section.** Section 04 is assembled from the same rollup
 *   as section 02, so the gaps cannot fall out of the document.
 * - **Prints as itself.** The document column IS the print layout. The aside
 *   is screen-only chrome; the shell is hidden in print by the dashboard
 *   layout, and `.m-report-doc` rebinds the dark theme to ink on paper.
 */

function SectionHeading({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <h2 className="font-mono-label text-[13px] font-semibold uppercase tracking-[0.12em] text-outline">
      {n} — {children}
    </h2>
  );
}

export function ExecutiveReportDocument({
  report,
  searchId,
  candidateId,
  stageLabel,
}: {
  report: CompiledReport;
  searchId: string;
  candidateId: string;
  stageLabel: string;
}) {
  const searchHref = `/app/executive-intelligence/searches/${searchId}`;
  const candidateHref = `${searchHref}/candidates/${candidateId}`;

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6 print:p-0">
      <SetBreadcrumbs
        crumbs={[
          { label: "Executive Intelligence", href: "/app/executive-intelligence" },
          { label: report.companyName, href: searchHref },
          { label: "Report" },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] print:block">
        {/* The 780px measure survives print: it is the document, and on a
            wide sheet `max-w-none` would set 200-character lines. */}
        <article className="m-report-doc mx-auto w-full max-w-[780px] rounded-[10px] border border-outline-variant bg-surface-container-low px-8 py-10 sm:px-16 sm:py-12 print:rounded-none print:border-0 print:px-0 print:py-0">
          <header className="flex flex-col gap-4 border-b border-outline-variant/60 pb-7">
            <p className="font-heading text-[11px] font-bold uppercase tracking-[0.14em] text-outline">
              Mandate · Executive Intelligence
            </p>
            <h1 className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-on-surface">
              {report.candidateName}
            </h1>
            <p className="text-[15px] leading-relaxed text-on-surface-variant">
              {report.roleTitle} · {report.companyName} · {stageLabel}
            </p>

            {/* What it is not, before anything it is. */}
            <div className="flex items-start gap-3 rounded-lg border border-outline-variant p-4">
              <IconInfo size={15} className="mt-0.5 shrink-0 text-outline" />
              <p className="text-[13px] leading-relaxed text-outline">
                This report records evidence gathered against an approved
                success profile. It contains no hiring recommendation, no score
                of the person, and no inference beyond what an interviewer
                wrote down.
              </p>
            </div>

            {/*
              Weights can be re-approved after an assessment is signed off. The
              document recomputes against the current weights, so when they
              have moved it says so rather than presenting numbers nobody
              approved as if they were the approved ones.
            */}
            {report.weightsDrifted && (
              <p className="rounded-lg border border-outline-variant bg-surface-container p-4 text-[13px] leading-relaxed text-on-surface-variant">
                The competency weights on this search changed after the
                assessment was approved. Coverage below is computed against the
                current weights and the approved ratings. Re-approve the
                assessment if this report is to be signed against the weights
                in force today.
              </p>
            )}
          </header>

          <section className="mt-8 flex flex-col gap-3.5">
            <SectionHeading n="01">What the role requires</SectionHeading>
            {report.mandateParagraphs.map((p) => (
              <p key={p.slice(0, 48)} className="text-[17px] leading-[1.75] text-on-surface">
                {p}
              </p>
            ))}
            <p className="text-[15px] leading-[1.7] text-on-surface-variant">
              {report.competencyCount} competencies were weighted on the
              approved success profile. Everything below is recorded against
              that set.
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

            <div className="overflow-hidden rounded-[10px] border border-outline-variant bg-surface-container">
              <div className="flex flex-wrap items-baseline gap-3.5 border-b border-outline-variant/60 px-5 py-4">
                <span className="font-heading text-[30px] leading-none tabular-nums text-on-surface">
                  {report.coveredWeightPercent}%
                </span>
                <span className="text-sm leading-relaxed text-on-surface-variant">
                  of the role&apos;s competency weight has evidence recorded ·{" "}
                  {report.coveredCount} of {report.competencyCount} competencies
                </span>
              </div>

              {/*
                One row, two shapes. Narrow: label, then weight and level on a
                line together, then the bar full width — the level word is the
                cell that matters and it must not end up the last thing on a
                line by itself. Wide: the comp's single line. Explicit
                placement rather than auto-flow, because the DOM order that
                reads correctly narrow is not the one that reads correctly
                wide.
              */}
              <ul className="flex flex-col gap-5 px-5 py-4 sm:gap-3.5">
                {report.coverage.map((c) => (
                  <li
                    key={c.competencyKey}
                    className="m-report-keep grid grid-cols-[2.5rem_1fr] items-center gap-x-3.5 gap-y-1.5 sm:grid-cols-[230px_2.5rem_minmax(60px,1fr)_8rem]"
                  >
                    <span className="col-span-2 text-[13px] leading-snug text-on-surface-variant sm:col-span-1 sm:col-start-1 sm:row-start-1">
                      {c.label}
                    </span>
                    <span className="font-mono-data text-xs text-outline sm:col-start-2 sm:row-start-1">
                      {c.weightShare}%
                    </span>
                    <span className="text-xs leading-snug text-on-surface-variant sm:col-start-4 sm:row-start-1 sm:text-right">
                      {c.ratingWord}
                    </span>
                    {/* One hue at two weights — never a quality gradient. */}
                    <span
                      aria-hidden
                      className="m-report-bar col-span-2 h-1.5 overflow-hidden rounded-sm bg-surface-container-high sm:col-span-1 sm:col-start-3 sm:row-start-1"
                    >
                      <span
                        className={`block h-full ${c.rating === "strong" ? "bg-primary" : "bg-outline"}`}
                        style={{ width: `${c.fill}%` }}
                      />
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

            {/*
              Attribution is stated once. One assessment has one approver, so
              repeating "recorded by" under every competency would put the same
              name on the page six times and say nothing new.
            */}
            {report.recordedBy && (
              <p className="font-mono-label text-[11px] uppercase text-outline">
                Recorded by {report.recordedBy}
              </p>
            )}

            {report.assessorSummary && (
              <p className="whitespace-pre-line text-[15px] leading-[1.75] text-on-surface-variant">
                {report.assessorSummary}
              </p>
            )}

            {report.evidence.length === 0 ? (
              <p className="text-[15px] leading-[1.75] text-on-surface-variant">
                No written evidence was recorded against any competency. The
                ratings in section 02 stand without supporting notes, which is
                stated here rather than presented as an omission.
              </p>
            ) : (
              report.evidence.map((e) => (
                <div
                  key={e.competencyKey}
                  className="m-report-keep flex flex-col gap-2 border-l-2 border-outline-variant pl-5"
                >
                  <p className="font-heading text-[15px] font-semibold leading-snug text-on-surface">
                    {e.label}
                  </p>
                  <p className="font-mono-label text-[11px] uppercase text-outline">
                    {[e.ratingWord, ...e.sourceStages].join(" · ")}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-[1.75] text-on-surface-variant">
                    {e.body}
                  </p>
                </div>
              ))
            )}
          </section>

          {/*
            Section 04 is the point of the document. The gaps get the same
            weight as the strengths, and the report refuses to close them by
            inference. Assembled from the rollup, not written by a model.
          */}
          <section className="mt-8 flex flex-col gap-3.5">
            <SectionHeading n="04">Where evidence is thin</SectionHeading>
            {report.thinParagraphs.map((p) => (
              <p key={p.slice(0, 48)} className="text-[15px] leading-[1.75] text-on-surface-variant">
                {p}
              </p>
            ))}
          </section>

          <footer className="mt-8 border-t border-outline-variant/60 pt-6">
            <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              Provenance
            </p>
            <div className="mt-2.5 grid gap-x-6 gap-y-1.5 font-mono-label text-[11px] uppercase leading-[1.7] text-outline sm:grid-cols-2">
              {report.provenance.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>
          </footer>
        </article>

        {/* Sticky: the document runs to several screens and the print control
            has to stay reachable from anywhere in it. */}
        <aside className="flex flex-col gap-5 print:hidden xl:sticky xl:top-6 xl:self-start">
          <div>
            <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              Status
            </p>
            <span className="mt-2.5 inline-block rounded-md bg-primary/20 px-2.5 py-1.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
              Compiled from approved records
            </span>
            <p className="mt-2.5 text-xs leading-relaxed text-outline">
              Nothing is generated at read time. Reloading produces the same
              document unless an underlying artifact is re-approved at a new
              version.
            </p>
          </div>

          <div className="border-t border-outline-variant/60 pt-5">
            <PrintReportButton />
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

          <div className="border-t border-outline-variant/60 pt-5">
            <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              Source records
            </p>
            <ul className="mt-2.5 flex flex-col gap-2 text-[13px] leading-relaxed">
              <li>
                <Link
                  href={`${searchHref}/success-profile`}
                  className="text-primary hover:underline"
                >
                  Success profile
                </Link>
              </li>
              <li>
                <Link
                  href={`${candidateHref}/interview-plan`}
                  className="text-primary hover:underline"
                >
                  Interview plan
                </Link>
              </li>
              <li>
                <Link
                  href={`${candidateHref}/assessment`}
                  className="text-primary hover:underline"
                >
                  Assessment
                </Link>
              </li>
            </ul>
          </div>

          {/*
            Screen only, and deliberately not in the document: the same
            weighted figure the assessment editor shows, so a recruiter can
            reconcile the two. It stays off the client's copy because a single
            percentage next to a person's name reads as a grade, which is
            exactly what this product refuses to produce.
          */}
          <div className="border-t border-outline-variant/60 pt-5">
            <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              Internal check
            </p>
            <p className="mt-2.5 text-xs leading-relaxed text-outline">
              Weighted evidence strength {report.weightedStrengthPercent}% — the
              figure recorded on the assessment. Not part of the document.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
