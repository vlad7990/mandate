import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconInfo } from "@/components/icons";

/**
 * The Executive Intelligence report — comp 12, from fixtures.
 *
 * The artifact the whole chain builds toward, and the one where getting
 * the register wrong does real harm. Three rules from the comp:
 *
 * - **No grades, no percentiles.** Coverage is stated as a fraction of
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
 */

const COVERAGE = [
  { name: "Scaling operations through growth", weight: 24, level: "Strong", width: 100 },
  { name: "Regulatory & control environment", weight: 21, level: "Strong", width: 100 },
  { name: "Partner-level influence", weight: 18, level: "Moderate", width: 66 },
  { name: "Capital & cost discipline", weight: 15, level: "Strong", width: 100 },
  { name: "Talent architecture", weight: 12, level: "Moderate", width: 66 },
  { name: "Technology judgment", weight: 10, level: "Limited", width: 33 },
];

const EVIDENCE = [
  {
    competency: "Scaling operations through growth",
    meta: "Strong · stages 1, 3 · recorded by E. Marchetti",
    body: "Described taking a shared-services function from 40 to 190 people across two years, including the decision to insource payroll after a failed vendor transition. Gave specific figures for cycle time before and after, and named the two things he would do differently.",
  },
  {
    competency: "Regulatory & control environment",
    meta: "Strong · stage 2 · recorded by E. Marchetti",
    body: "Carried a control remediation through to regulator sign-off and walked through the escalation path he built. Volunteered where the programme slipped and what it cost.",
  },
  {
    competency: "Technology judgment",
    meta: "Limited · stage 3 · recorded by E. Marchetti",
    body: "Answered at the level of vendor selection rather than architecture. One concrete example given. The stage ran short by twelve minutes; this competency was not fully covered.",
  },
];

const PROVENANCE = [
  "SUCCESS PROFILE v3 · APPROVED · E. MARCHETTI",
  "INTERVIEW PLAN v2 · APPROVED · E. MARCHETTI",
  "ASSESSMENT v1 · APPROVED · E. MARCHETTI",
  "ASSESSMENT AUTHORED BY A HUMAN · NO AI",
  "COVERAGE COMPUTED SERVER-SIDE ON SAVE",
  "COMPILED FROM APPROVED RECORDS ONLY",
];

function SectionHeading({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <h2 className="font-mono-label text-[13px] font-semibold uppercase tracking-[0.12em] text-outline">
      {n} — {children}
    </h2>
  );
}

export function SampleEiReport({ searchId }: { searchId: string }) {
  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <SetBreadcrumbs
        crumbs={[
          { label: "Executive Intelligence", href: "/app/executive-intelligence" },
          { label: "Northvale Capital", href: `/app/executive-intelligence/searches/${searchId}` },
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
        <article className="mx-auto w-full max-w-[780px] rounded-[10px] border border-outline-variant bg-surface-container-low px-8 py-10 sm:px-16 sm:py-12 print:max-w-none print:border-0 print:px-0">
          <header className="flex flex-col gap-4 border-b border-outline-variant/60 pb-7">
            <p className="font-heading text-[11px] font-bold uppercase tracking-[0.14em] text-outline">
              Mandate · Executive Intelligence
            </p>
            <h1 className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-on-surface">
              Daniel Okonjo
            </h1>
            <p className="text-[15px] leading-relaxed text-on-surface-variant">
              Chief Operating Officer · Northvale Capital · diligence complete
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
          </header>

          <section className="mt-8 flex flex-col gap-3.5">
            <SectionHeading n="01">What the role requires</SectionHeading>
            <p className="text-[17px] leading-[1.75] text-on-surface">
              Northvale needs an operator who can industrialise a firm that has
              doubled AUM on founder-era processes — without slowing
              origination while doing it. Six competencies were weighted and
              approved before any candidate was assessed.
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
                  100%
                </span>
                <span className="text-sm leading-relaxed text-on-surface-variant">
                  of weighted competencies have evidence recorded · 6 of 6
                </span>
              </div>

              <ul className="flex flex-col gap-3.5 px-5 py-4">
                {COVERAGE.map((c) => (
                  <li key={c.name} className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
                    <span className="w-full text-[13px] leading-snug text-on-surface-variant sm:w-[230px]">
                      {c.name}
                    </span>
                    <span className="w-10 shrink-0 font-mono-data text-xs text-outline">
                      {c.weight}%
                    </span>
                    {/* One hue at two weights — never a quality gradient. */}
                    <span
                      aria-hidden
                      className="h-1.5 min-w-[60px] flex-1 overflow-hidden rounded-sm bg-surface-container-high"
                    >
                      <span
                        className={`block h-full ${c.level === "Strong" ? "bg-primary" : "bg-outline"}`}
                        style={{ width: `${c.width}%` }}
                      />
                    </span>
                    <span className="w-[76px] shrink-0 text-right text-xs text-on-surface-variant">
                      {c.level}
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
            {EVIDENCE.map((e) => (
              <div
                key={e.competency}
                className="flex flex-col gap-2 border-l-2 border-outline-variant pl-5"
              >
                <p className="font-heading text-[15px] font-semibold leading-snug text-on-surface">
                  {e.competency}
                </p>
                <p className="font-mono-label text-[11px] uppercase text-outline">
                  {e.meta}
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
            by inference.
          */}
          <section className="mt-8 flex flex-col gap-3.5">
            <SectionHeading n="04">Where evidence is thin</SectionHeading>
            <p className="text-[15px] leading-[1.75] text-on-surface-variant">
              Technology judgment carries 10% of the weighted set and holds
              limited evidence. Partner-level influence and talent architecture
              are moderate. If those weigh on the decision, a further stage is
              the honest way to close them — this report will not close them by
              inference.
            </p>
          </section>

          <footer className="mt-8 border-t border-outline-variant/60 pt-6">
            <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              Provenance
            </p>
            <div className="mt-2.5 grid gap-x-6 gap-y-1.5 font-mono-label text-[11px] leading-[1.7] text-outline sm:grid-cols-2">
              {PROVENANCE.map((p) => (
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
            <span className="mt-2.5 inline-block rounded-md bg-primary/20 px-2.5 py-1.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
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
