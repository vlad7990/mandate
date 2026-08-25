"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconChevronDown, IconInfo } from "@/components/icons";
import { sampleCandidate, sampleMandate } from "@/lib/sample";

/**
 * The sample candidate — comp 10, rendered from fixtures.
 *
 * The comp's brief is that 39 buttons on one scroll become five tabs
 * and one persistent decision rail. The rule underneath it: reading
 * material is tabbed, but the two write actions a recruiter performs
 * daily — advance the stage, add a note — never move.
 *
 * Two other rules carried through:
 *
 * - **One h1**, the candidate's name, with no button inside it. Every
 *   panel title is an h3 beneath it.
 * - **Scores carry evidence.** Each dimension sits next to the fact
 *   that produced it, so a number is never the whole argument — which
 *   is also what keeps a score from reading as a verdict.
 */

const TABS = [
  "Overview",
  "Evaluation",
  "Interview plan",
  "Triangulation",
  "Positioning",
  "Notes & activity",
] as const;
type Tab = (typeof TABS)[number];

/*
  The product's five scoring dimensions, at the weights the current
  calibration model carries — see `SAMPLE_CALIBRATION_HISTORY[0]`.

  These used to be five invented prose names ("Regulated-environment scale",
  "Delivery pace") at weights summing to 85. They read better and they taught
  a vocabulary the product does not have: the scoring engine has exactly five
  fixed keys and there is nowhere in the schema for a custom name. A prospect
  who learned those names here would meet Technical / Domain / Leadership /
  Regulatory / Transformation on their own first mandate.

  The specificity moved into the evidence, which is where it belonged
  anyway — the rule this screen exists to demonstrate is that a score never
  travels without the fact that produced it.
*/
const DIMENSIONS = [
  { name: "Regulatory", weight: 26, score: 95, evidence: "HIPAA and MHRA estates; owned the clinical safety case" },
  { name: "Transformation", weight: 22, score: 92, evidence: "£48m records replacement, delivered" },
  { name: "Leadership", weight: 20, score: 84, evidence: "Two board reviews led; no COO reporting line" },
  { name: "Domain", weight: 18, score: 88, evidence: "6,400-staff regulated care provider, 4 yrs" },
  { name: "Technical", weight: 14, score: 64, evidence: "Architecture reviews chaired; five-year programme horizon" },
];

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-outline-variant bg-surface-container-low p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          {title}
        </h3>
        {meta && (
          <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
            {meta}
          </span>
        )}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

export function SampleCandidateDetail({
  projectId,
  candidateId,
}: {
  projectId: string;
  candidateId: string;
}) {
  const [tab, setTab] = useState<Tab>("Overview");

  const c = sampleCandidate(candidateId);
  const mandate = sampleMandate(projectId);
  if (!c || !mandate) notFound();

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <SetBreadcrumbs
        crumbs={[
          { label: "Mandates", href: "/app/projects" },
          { label: mandate.company, href: `/app/projects/${projectId}` },
          { label: c.name },
        ]}
      />

      <SampleBanner scope="candidate" />

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {/* Identity. One h1, no control inside it. */}
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center border border-outline-variant bg-surface-container-high font-mono-label text-base font-semibold text-on-surface-variant"
            >
              {c.name
                .split(/\s+/)
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[26px] font-bold leading-tight tracking-tight text-on-surface">
                  {c.name}
                </h1>
                {c.tier !== null && (
                  <span
                    className={`px-2 py-1 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] ${
                      c.tier === 1
                        ? "bg-primary/20 text-primary"
                        : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    Tier {c.tier}
                  </span>
                )}
                {c.archetype && (
                  <span className="bg-surface-container-high px-2.5 py-1.5 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                    {c.archetype}
                  </span>
                )}
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-outline">
                <span className="text-on-surface-variant">
                  {c.currentTitle}, {c.currentCompany}
                </span>
                {c.location && (
                  <>
                    <span aria-hidden className="text-outline-variant">/</span>
                    <span>{c.location}</span>
                  </>
                )}
                <span aria-hidden className="text-outline-variant">/</span>
                <span>{mandate.title} · {mandate.company}</span>
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Candidate sections"
            className="mt-5 flex flex-wrap items-end gap-6 border-b border-outline-variant"
          >
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`relative -mb-px min-h-11 border-0 bg-transparent px-0.5 pb-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                  tab === t ? "text-on-surface" : "text-outline hover:text-on-surface-variant"
                }`}
              >
                {t}
                {tab === t && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                  />
                )}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="mt-5 flex flex-col gap-[18px]">
            {tab === "Overview" && (
              <>
                <Panel
                  title="Fit summary"
                  meta="Decision support · not a recommendation"
                >
                  <p className="max-w-[76ch] text-sm leading-relaxed text-on-surface-variant">
                    Ran a four-year core platform replacement at{" "}
                    {c.currentCompany} across 6,400 staff in a regulated
                    setting — the closest analogue in the pool to what{" "}
                    {mandate.company} has budgeted. Board exposure is
                    documented through two annual technology reviews. The open
                    question is pace.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-outline-variant/60 pt-4 sm:grid-cols-4">
                    {[
                      { k: "Weighted fit", v: String(c.fit ?? "—") },
                      { k: "Rank", v: "01", sub: "of 18" },
                      { k: "Must-haves met", v: "3", sub: "of 3" },
                      { k: "Anti-patterns", v: "0" },
                    ].map((s) => (
                      <div key={s.k}>
                        <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline">
                          {s.k}
                        </p>
                        <p className="mt-1.5 font-heading text-[26px] leading-none tabular-nums text-on-surface">
                          {s.v}
                          {s.sub && (
                            <span className="ml-1 text-xs font-normal text-outline">
                              {s.sub}
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>

                <div className="grid gap-[18px] lg:grid-cols-2">
                  <Panel title="Evidence for">
                    <ul className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-on-surface-variant">
                      <li>Owned a £48m clinical platform replacement to completion</li>
                      <li>Grew engineering from 90 to 240; attrition under 9%</li>
                      <li>Two documented board technology reviews as presenting owner</li>
                    </ul>
                  </Panel>
                  <Panel title="Open questions">
                    <ul className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-on-surface-variant">
                      <li>Technical depth against a three-year horizon</li>
                      <li>Has not reported to a COO; the line here is unchanged</li>
                      <li>Competing process recorded in your note</li>
                    </ul>
                  </Panel>
                </div>
              </>
            )}

            {tab === "Evaluation" && (
              <Panel
                title="Scored against the approved model"
                meta="Calibration v3 · 9 dimensions"
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] border-collapse tabular-nums">
                    <caption className="sr-only">
                      Dimension scores with the weight and the evidence behind
                      each.
                    </caption>
                    <thead>
                      <tr>
                        {["Dimension", "Weight", "Score", "Evidence"].map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className="py-3 text-left font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DIMENSIONS.map((d) => (
                        <tr key={d.name} className="border-t border-outline-variant/50">
                          <td className="py-3 pr-4 text-[13px] font-medium text-on-surface">
                            {d.name}
                          </td>
                          <td className="py-3 pr-4 font-mono-data text-[13px] text-outline">
                            {d.weight}%
                          </td>
                          <td className="py-3 pr-4 font-mono-data text-[13px] text-on-surface">
                            {d.score}
                          </td>
                          {/* The fact sits beside the number, so the
                              number is never the whole argument. */}
                          <td className="py-3 text-xs leading-snug text-outline">
                            {d.evidence}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            {tab === "Interview plan" && (
              <Panel
                title="Interview plan"
                meta="Approved v2 // sample data"
              >
                <div className="space-y-4">
                  <p className="text-[13px] leading-relaxed text-on-surface-variant">
                    Three stages, sequenced from regulated-delivery depth to
                    board-level judgment — the two heaviest calibration
                    dimensions each get a dedicated stage.
                  </p>
                  {[
                    {
                      n: "01",
                      name: "Regulated delivery deep-dive",
                      who: "Peer CTO · 90m",
                      q: "Walk through the clinical safety case you owned — what did the regulator push back on, and what changed?",
                      listen:
                        "Names the framework, the finding, and the remediation — not just the outcome.",
                    },
                    {
                      n: "02",
                      name: "Transformation under constraint",
                      who: "Programme sponsor · 60m",
                      q: "The £48m records replacement landed — what did you cut to keep the date, and who disagreed?",
                      listen:
                        "Owns a trade-off with a name and a consequence attached.",
                    },
                    {
                      n: "03",
                      name: "Board and stakeholder judgment",
                      who: "CEO · 45m",
                      q: "Tell us about a board review that went badly — what did you change before the next one?",
                      listen:
                        "Specific meeting, specific correction; no borrowed war stories.",
                    },
                  ].map((s) => (
                    <div
                      key={s.n}
                      className="border border-outline-variant bg-surface-container-lowest p-4 space-y-2"
                    >
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-[13px] font-medium text-on-surface">
                          <span className="font-mono-data text-outline mr-2">{s.n}</span>
                          {s.name}
                        </span>
                        <span className="font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                          {s.who}
                        </span>
                      </div>
                      <p className="text-xs leading-snug text-on-surface-variant">{s.q}</p>
                      <p className="text-xs leading-snug text-outline">
                        Listen for: {s.listen}
                      </p>
                    </div>
                  ))}
                  <p className="font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                    Decision support — never a recommendation. The plan
                    gathers evidence; humans decide.
                  </p>
                </div>
              </Panel>
            )}

            {tab === "Triangulation" && (
              <Panel
                title="Three views of fit"
                meta="Candidate × role × hiring manager"
              >
                <div className="grid gap-3.5 lg:grid-cols-3">
                  {[
                    {
                      k: "Role requirements",
                      v: "Regulated scale, platform replacement, board exposure — all three met with documented evidence.",
                      s: "Strong alignment",
                      tense: false,
                    },
                    {
                      k: "Hiring manager pattern",
                      v: "The hiring manager has advanced operators and rejected transformers on pace. This candidate reads as a transformer.",
                      s: "Tension",
                      tense: true,
                    },
                    {
                      k: "Candidate motivation",
                      v: "Stated in your call: wants a mandate with an explicit board sponsor. This one is implicit.",
                      s: "Needs clarification",
                      tense: false,
                    },
                  ].map((v) => (
                    <div
                      key={v.k}
                      className="flex flex-col gap-2.5 border border-outline-variant bg-surface-container p-4"
                    >
                      <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                        {v.k}
                      </p>
                      <p className="text-[13px] leading-relaxed text-on-surface-variant">
                        {v.v}
                      </p>
                      <p
                        className={`font-mono-label text-xs ${v.tense ? "text-error" : "text-outline"}`}
                      >
                        {v.s}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3.5 flex items-start gap-2 border-t border-outline-variant/60 pt-3.5 text-xs leading-relaxed text-outline">
                  <IconInfo size={13} className="mt-0.5 shrink-0" />
                  Triangulation fuses recorded evidence from three sources. It
                  makes no claim about the person&apos;s character, and it
                  produces no recommendation to hire or reject.
                </p>
              </Panel>
            )}

            {tab === "Positioning" && (
              <Panel
                title="Submission narrative"
                meta="Draft · editable · goes to the client"
              >
                <div className="max-w-[74ch] border border-outline-variant bg-surface-container-lowest px-6 py-5">
                  <p className="font-heading text-base leading-[1.75] text-on-surface">
                    {c.name.split(" ")[0]} has already done the thing{" "}
                    {mandate.company} is about to attempt — replacing a
                    decade-old platform across 6,400 staff without a service
                    interruption, carrying the board through it personally.
                  </p>
                  <p className="mt-3.5 font-heading text-base leading-[1.75] text-on-surface-variant">
                    The conversation worth having is horizon. That programme ran
                    to five years; this one is scoped to three. Their view on
                    what is compressible — and what is not — will tell you more
                    than any reference.
                  </p>
                </div>
              </Panel>
            )}

            {tab === "Notes & activity" && (
              <Panel title="History">
                <ul className="flex flex-col divide-y divide-outline-variant/50">
                  {[
                    {
                      m: "Call · Elena Marchetti",
                      v: "Confirmed a second process elsewhere, later stage. Wants an explicit board sponsor before engaging further.",
                    },
                    { m: "System", v: "Stage advanced Shortlisted → Submitted" },
                    {
                      m: "System",
                      v: "CV parsed and evaluated · entered ranking at 5 of 14",
                    },
                  ].map((n) => (
                    <li key={n.v} className="py-3.5 first:pt-0 last:pb-0">
                      <p className="font-mono-label text-xs uppercase text-outline">
                        {n.m}
                      </p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-on-surface-variant">
                        {n.v}
                      </p>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>

        {/*
          The decision rail. Stays put across every tab, because the two
          things a recruiter does daily should never be behind a tab.
        */}
        <aside className="flex flex-col gap-5 border border-outline-variant bg-surface-container-lowest p-5">
          <div className="flex flex-col gap-2.5">
            <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              Pipeline stage
            </p>
            <div className="flex h-[38px] items-center gap-2.5 border border-outline-variant bg-surface-container-low px-3">
              <span className="text-[13px] text-on-surface">{c.stage}</span>
              <IconChevronDown size={14} className="ml-auto text-outline" />
            </div>
            <p className="text-[11px] leading-relaxed text-outline">
              Changing the stage is logged and visible to the mandate.
            </p>
          </div>

          <div className="border-t border-outline-variant/60 pt-4">
            <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              Also appears in
            </p>
            <div className="mt-3 flex flex-col gap-2 text-xs leading-relaxed text-on-surface-variant">
              <span>
                CIO · Pellworth Group{" "}
                <span className="text-outline">· declined</span>
              </span>
              <span>
                CTO · Marlow Diagnostics{" "}
                <span className="text-outline">· finalist</span>
              </span>
            </div>
          </div>

          <p className="mt-auto border-t border-outline-variant/60 pt-4 text-[11px] leading-relaxed text-outline">
            This is a sample candidate, so the write actions are not shown —
            there is nothing real to advance or annotate.{" "}
            <Link href="/app/projects" className="text-primary hover:underline">
              Open a real mandate
            </Link>{" "}
            to use them.
          </p>
        </aside>
      </div>
    </div>
  );
}
