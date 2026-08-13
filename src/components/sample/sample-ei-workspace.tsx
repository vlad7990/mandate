import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconChevronRight } from "@/components/icons";

/**
 * The sample Executive Intelligence workspace — comp 11, from fixtures.
 *
 * Three rules from the comp, all of them about what a record *is*:
 *
 * - **Approved looks deliberate.** Read-only is expressed as a
 *   provenance footer — who approved it, when, which version it
 *   supersedes, which prompt and model produced the draft — not as a
 *   greyed-out form. An approved success profile is the record of a
 *   decision, and it should read like one.
 * - **Gates are signposts.** The locked step states what unlocks it.
 *   Nobody should discover a database constraint by clicking into a
 *   dead end.
 * - **Editorial, not terminal.** EI artifacts get a wider measure and
 *   more generous leading than the rest of the app — same tokens, a
 *   different density register.
 *
 * One deviation: the comp sets EI titles in Fraunces, which the app does
 * not load (marketing does). Rather than add a webfont to the
 * authenticated bundle for a sample screen, this uses the app's heading
 * face at the comp's sizes and leading. If EI adopts the editorial
 * register for real, load Fraunces in the dashboard layout first.
 */

type ChainStep = {
  label: string;
  state: "ready" | "approved" | "linked" | "progress" | "locked";
  badge: string;
  detail: string;
};

const CHAIN: readonly ChainStep[] = [
  {
    label: "Company context",
    state: "ready",
    badge: "Ready",
    detail: "Grounded on day 1 · 22 sources",
  },
  {
    label: "Success profile",
    state: "approved",
    badge: "Approved",
    detail: "v3 · approved by E. Marchetti",
  },
  {
    label: "Candidates",
    state: "linked",
    badge: "4 linked",
    detail: "2 in diligence · 1 advanced",
  },
  {
    label: "Interview plans",
    state: "progress",
    badge: "In progress",
    detail: "2 approved · 1 draft · 1 not started",
  },
  {
    // The gate states its own precondition.
    label: "Assessments",
    state: "locked",
    badge: "Locked",
    detail: "Opens per candidate once their interview plan is approved",
  },
];

const WEIGHTS = [
  { name: "Scaling operations through growth", w: 24 },
  { name: "Regulatory & control environment", w: 21 },
  { name: "Partner-level influence", w: 18 },
  { name: "Capital & cost discipline", w: 15 },
  { name: "Talent architecture", w: 12 },
  { name: "Technology judgment", w: 10 },
];

const LINKED = [
  {
    initials: "DO",
    name: "Daniel Okonjo",
    role: "CIO · Pellworth NHS Trust",
    stage: "Advanced",
    note: "Assessment approved · 6 of 6 competencies evidenced",
    muted: false,
  },
  {
    initials: "IB",
    name: "Ingrid Bellweather",
    role: "COO · Halden Freight",
    stage: "In diligence",
    note: "Interview plan approved · assessment not started",
    muted: false,
  },
  {
    initials: "TQ",
    name: "Tomasz Quintero-Reyes",
    role: "Managing Director, Operations · Kestrel Bank",
    stage: "In diligence",
    note: "Interview plan in draft · not yet approved",
    muted: false,
  },
  {
    initials: "RS",
    name: "Rachel Sowande",
    role: "COO · Bramblewick Retail",
    stage: "On hold",
    note: "Paused at the candidate's request",
    muted: true,
  },
];

const AUDIT = [
  { d: "Day 39", e: "assessment.approved · Okonjo · E. Marchetti" },
  { d: "Day 37", e: "interview_plan.approved · Bellweather · v2" },
  { d: "Day 36", e: "candidate_link.stage_changed · Sowande → on_hold" },
  { d: "Day 33", e: "success_profile.approved · v3 · weights written" },
  { d: "Day 33", e: "success_profile.archived · v2 superseded" },
];

function Panel({
  title,
  meta,
  children,
  dashed,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  dashed?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden bg-surface-container-low ${
        dashed
          ? "border border-dashed border-outline-variant"
          : "border border-outline-variant"
      }`}
    >
      <div className="flex items-center gap-2.5 border-b border-outline-variant px-5 py-4">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  );
}

// The sample workspace renders one fixed example search, so the id is
// only the routing signal — there is nothing to look up with it.
export function SampleEiWorkspace() {
  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <SetBreadcrumbs
        crumbs={[
          { label: "Executive Intelligence", href: "/app/executive-intelligence" },
          { label: "Chief Operating Officer · Northvale Capital" },
        ]}
      />

      <SampleBanner scope="executive search" />

      <div className="mt-5 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-[30px] font-semibold leading-tight tracking-tight text-on-surface">
              Chief Operating Officer
            </h1>
            <span className="border border-outline-variant bg-surface-container px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
              Active
            </span>
            <span className="border border-outline-variant bg-surface-container px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
              Premium
            </span>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-outline">
            <span className="text-on-surface-variant">Northvale Capital</span>
            <span aria-hidden className="text-outline-variant">/</span>
            <span>Private credit, 340 staff</span>
            <span aria-hidden className="text-outline-variant">/</span>
            <span>4 candidates in diligence</span>
          </p>
        </div>
      </div>

      {/* The chain, drawn as a path rather than discovered by hitting walls. */}
      <section className="mt-5 border border-outline-variant bg-surface-container-low p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-sm font-semibold text-on-surface">
            Diligence chain
          </h2>
          <span className="font-mono-label text-[11px] text-outline">
            EACH STEP UNLOCKS THE NEXT · APPROVAL IS IRREVERSIBLE IN PLACE
          </span>
        </div>

        <ol className="mt-4 flex flex-col gap-2 xl:flex-row xl:items-stretch xl:gap-0">
          {CHAIN.map((s, i) => (
            <li key={s.label} className="flex min-w-0 flex-1 items-stretch">
              <div
                className={`flex min-w-0 flex-1 flex-col gap-2 border p-3.5 ${
                  s.state === "progress"
                    ? "border-primary bg-surface-container"
                    : s.state === "locked"
                      ? "border-outline-variant bg-surface-container-low"
                      : "border-outline-variant bg-surface-container"
                }`}
              >
                <span
                  className={`font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] ${
                    s.state === "locked" ? "text-outline" : "text-primary"
                  }`}
                >
                  {s.badge}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    s.state === "locked" ? "text-outline" : "text-on-surface"
                  }`}
                >
                  {s.label}
                </span>
                <span className="text-xs leading-relaxed text-outline">
                  {s.detail}
                </span>
              </div>

              {i < CHAIN.length - 1 && (
                <span
                  aria-hidden
                  className="hidden w-6 shrink-0 items-center justify-center text-outline-variant xl:flex"
                >
                  <IconChevronRight size={14} />
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Success profile"
            meta={
              <>
                <span className="bg-primary/20 px-2 py-1 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                  Approved · read-only
                </span>
                <span className="ml-auto font-mono-label text-[11px] text-outline">
                  v3
                </span>
              </>
            }
          >
            <div className="flex flex-col gap-[18px] px-5 py-5">
              {/* Editorial register: wider measure, generous leading. */}
              <p className="max-w-[70ch] text-[17px] leading-[1.7] text-on-surface">
                Northvale needs an operator who can industrialise a firm that
                has doubled AUM on founder-era processes — without slowing
                origination while doing it.
              </p>

              <div className="flex flex-col gap-3">
                <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                  Operational competency weights
                </p>
                <div className="grid gap-x-7 gap-y-2.5 sm:grid-cols-2">
                  {WEIGHTS.map((d) => (
                    <div key={d.name}>
                      <div className="flex justify-between text-[13px] font-medium leading-[1.7] text-on-surface-variant">
                        <span>{d.name}</span>
                        <span className="font-mono-data">{d.w}%</span>
                      </div>
                      <span
                        aria-hidden
                        className="block h-1 bg-surface-container-high"
                      >
                        <span
                          className="block h-full bg-primary"
                          style={{ width: `${d.w}%` }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/*
                Provenance, not a disabled form. This is what makes an
                approved artifact read as a record: who, when, which
                version it supersedes, and which prompt and model drafted
                it — the same facts the audit trail holds.
              */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-outline-variant/60 pt-4 font-mono-label text-[11px] leading-relaxed text-outline">
                <span>APPROVED DAY 33 · 14:26 UTC</span>
                <span>BY ELENA MARCHETTI (SESSION-DERIVED)</span>
                <span>VERSION 3 · SUPERSEDES v2</span>
                <span>PROMPT v2.4</span>
              </div>
            </div>
          </Panel>

          <Panel
            title="Candidates in diligence"
            meta={
              <span className="font-mono-label text-[11px] text-outline">
                4 LINKED FROM THE ORGANISATION POOL
              </span>
            }
          >
            <ul className="divide-y divide-outline-variant/40">
              {LINKED.map((c) => (
                <li
                  key={c.name}
                  className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-5 py-4"
                >
                  <span
                    aria-hidden
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center border border-outline-variant bg-surface-container-high font-mono-label text-[11px] font-semibold text-on-surface-variant"
                  >
                    {c.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-medium ${c.muted ? "text-outline" : "text-on-surface"}`}
                    >
                      {c.name}
                    </span>
                    <span className="block truncate text-xs text-outline">
                      {c.role}
                    </span>
                  </span>
                  <span className="shrink-0 bg-surface-container-high px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
                    {c.stage}
                  </span>
                  <span className="w-full text-xs leading-relaxed text-outline sm:w-[200px]">
                    {c.note}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Intake brief">
            <div className="flex flex-col gap-3.5 px-5 py-4">
              {[
                {
                  k: "Mandate origin",
                  v: "AUM doubled in 26 months; operating model unchanged since founding.",
                },
                {
                  k: "Outcomes in 18 months",
                  v: "Close the control gaps flagged in the last review · reduce origination-to-close cycle by a third · build an ops leadership bench.",
                },
                {
                  k: "Non-negotiable",
                  v: "Has personally carried a regulated control remediation to closure.",
                },
              ].map((r) => (
                <div key={r.k}>
                  <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                    {r.k}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-on-surface-variant">
                    {r.v}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Audit trail"
            meta={
              <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                Append-only
              </span>
            }
          >
            <ul className="py-1.5">
              {AUDIT.map((a) => (
                <li key={a.e} className="flex gap-3 px-5 py-2.5">
                  <span className="w-16 shrink-0 font-mono-label text-[11px] leading-relaxed text-outline">
                    {a.d}
                  </span>
                  <span className="text-xs leading-relaxed text-on-surface-variant">
                    {a.e}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          {/* A locked capability that says what opens it, and what it
              will and will not do when it does. */}
          <Panel title="Risk review" dashed>
            <p className="px-5 py-4 text-[13px] leading-relaxed text-outline">
              Not yet available. Opens for a candidate once their assessment is
              approved — it reads only from recorded evidence, never from new
              inference.
            </p>
          </Panel>

          <p className="text-[11px] leading-relaxed text-outline">
            This is a sample search, so nothing here can be approved or
            edited.{" "}
            <Link
              href="/app/executive-intelligence"
              className="text-primary hover:underline"
            >
              Open a real executive search
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
