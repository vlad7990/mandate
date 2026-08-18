import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconChevronRight } from "@/components/icons";
import {
  SAMPLE_EXECUTIVE_AUDIT,
  SAMPLE_INTAKE_BRIEF,
  SAMPLE_LINKED_CANDIDATES,
  SAMPLE_OPERATIONAL_WEIGHTS,
  SAMPLE_PROFILE_PROVENANCE,
  SAMPLE_SEARCH_ID,
  SAMPLE_SUCCESS_PROFILE,
  sampleChain,
  sampleWorkedSearch,
} from "@/lib/sample";
import { EXEC_CANDIDATE_STAGE_LABELS } from "@/lib/executive/types";

/**
 * The sample Executive Intelligence workspace — comp 11, from fixtures.
 *
 * Three rules from the comp, all of them about what a record *is*:
 *
 * - **Approved looks deliberate.** Read-only is expressed as a
 *   provenance footer — who approved it, when, which version it
 *   supersedes, which prompt produced the draft — not as a greyed-out
 *   form. An approved success profile is the record of a decision, and
 *   it should read like one.
 * - **Gates are signposts.** A step states what unlocks it. Nobody should
 *   discover a database constraint by clicking into a dead end.
 * - **Editorial, not terminal.** EI artifacts get a wider measure and
 *   more generous leading than the rest of the app — same tokens, a
 *   different density register.
 *
 * One deviation: the comp sets EI titles in Fraunces, which the app does
 * not load (marketing does). Rather than add a webfont to the
 * authenticated bundle for a sample screen, this uses the app's heading
 * face at the comp's sizes and leading. If EI adopts the editorial
 * register for real, load Fraunces in the dashboard layout first.
 *
 * ## Two things W7 changed here
 *
 * **Nothing countable is typed any more.** This screen used to state "4
 * candidates in diligence" in its own header beside a chain that said "2
 * in diligence · 1 advanced" — one screen contradicting itself, the same
 * class as the comparison screen's "two at Tier 2" over a table of three.
 * Every count now comes from `sampleChain()` and the fixture arrays.
 *
 * **The competency names are the product's.** Six were invented here —
 * "Partner-level influence", "Talent architecture" — and none of them was
 * in the catalogue that `/competencies` renders one click away. See the
 * header of `src/lib/sample/executive.ts`.
 */

const CHAIN_HREF: Readonly<Record<string, string>> = {
  "Success profile": `/app/executive-intelligence/searches/${SAMPLE_SEARCH_ID}/success-profile`,
  Candidates: `/app/executive-intelligence/searches/${SAMPLE_SEARCH_ID}/candidates`,
};

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
  const search = sampleWorkedSearch();
  const chain = sampleChain();
  const dayOf = (daysAgo: number) => Math.max(1, search.openedDaysAgo - daysAgo);

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <SetBreadcrumbs
        crumbs={[
          { label: "Executive Intelligence", href: "/app/executive-intelligence" },
          { label: `${search.roleTitle} · ${search.companyName}` },
        ]}
      />

      <SampleBanner scope="executive search" />

      <div className="mt-5 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-[30px] font-semibold leading-tight tracking-tight text-on-surface">
              {search.roleTitle}
            </h1>
            <span className="border border-outline-variant bg-surface-container px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
              Active
            </span>
            <span className="border border-outline-variant bg-surface-container px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
              Premium
            </span>
          </div>
          {/* Derived, not typed — see the note above. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-outline">
            <span className="text-on-surface-variant">{search.companyName}</span>
            <span aria-hidden className="text-outline-variant">/</span>
            <span>Private credit, 340 staff</span>
            <span aria-hidden className="text-outline-variant">/</span>
            <span className="tabular-nums">
              {SAMPLE_LINKED_CANDIDATES.length} candidates linked
            </span>
            {/* No `/` before this one — `//` is already the separator, and
                the two together rendered "linked / // SAMPLE DATA". */}
            <span className="font-mono-label uppercase tracking-wider">
              {"// sample data"}
            </span>
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
          {chain.map((s, i) => {
            const href = CHAIN_HREF[s.label];
            const body = (
              <div
                className={`flex min-w-0 flex-1 flex-col gap-2 border p-3.5 ${
                  s.state === "progress"
                    ? "border-primary bg-surface-container"
                    : s.state === "locked"
                      ? "border-outline-variant bg-surface-container-low"
                      : "border-outline-variant bg-surface-container"
                } ${href ? "transition-colors hover:border-primary/70" : ""}`}
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
            );

            return (
              <li key={s.label} className="flex min-w-0 flex-1 items-stretch">
                {href ? (
                  <Link href={href} prefetch={false} className="flex min-w-0 flex-1">
                    {body}
                  </Link>
                ) : (
                  body
                )}

                {i < chain.length - 1 && (
                  <span
                    aria-hidden
                    className="hidden w-6 shrink-0 items-center justify-center text-outline-variant xl:flex"
                  >
                    <IconChevronRight size={14} />
                  </span>
                )}
              </li>
            );
          })}
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
                  v{SAMPLE_PROFILE_PROVENANCE.version}
                </span>
              </>
            }
          >
            <div className="flex flex-col gap-[18px] px-5 py-5">
              {/* Editorial register: wider measure, generous leading. */}
              <p className="max-w-[70ch] text-[17px] leading-[1.7] text-on-surface">
                {SAMPLE_SUCCESS_PROFILE.role_mission}
              </p>

              <div className="flex flex-col gap-3">
                <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                  Operational competency weights
                </p>
                <div className="grid gap-x-7 gap-y-2.5 sm:grid-cols-2">
                  {SAMPLE_OPERATIONAL_WEIGHTS.map((d) => (
                    <div key={d.competency_key}>
                      <div className="flex justify-between gap-3 text-[13px] font-medium leading-[1.7] text-on-surface-variant">
                        <span className="min-w-0">{d.label}</span>
                        <span className="font-mono-data shrink-0 tabular-nums">
                          {d.weight}%
                        </span>
                      </div>
                      <span
                        aria-hidden
                        className="block h-1 bg-surface-container-high"
                      >
                        <span
                          className="block h-full bg-primary"
                          style={{ width: `${d.weight}%` }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Link
                href={CHAIN_HREF["Success profile"]}
                prefetch={false}
                className="self-start font-mono-label text-[11px] uppercase tracking-widest text-primary hover:underline"
              >
                Read the full profile {"→"}
              </Link>

              {/*
                Provenance, not a disabled form. This is what makes an
                approved artifact read as a record: who, when, which
                version it supersedes, and which prompt drafted it — the
                same facts the audit trail holds.
              */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-outline-variant/60 pt-4 font-mono-label text-[11px] leading-relaxed text-outline">
                <span className="tabular-nums">
                  APPROVED DAY {dayOf(SAMPLE_PROFILE_PROVENANCE.approvedDaysAgo)}
                </span>
                <span>
                  BY {SAMPLE_PROFILE_PROVENANCE.approvedByName.toUpperCase()}
                </span>
                <span className="tabular-nums">
                  VERSION {SAMPLE_PROFILE_PROVENANCE.version} · SUPERSEDES v
                  {SAMPLE_PROFILE_PROVENANCE.supersedes}
                </span>
                <span className="uppercase">
                  {SAMPLE_PROFILE_PROVENANCE.modelVersion}
                </span>
              </div>
            </div>
          </Panel>

          <Panel
            title="Candidates in diligence"
            meta={
              <span className="font-mono-label text-[11px] tabular-nums text-outline">
                {SAMPLE_LINKED_CANDIDATES.length} LINKED FROM THE ORGANISATION POOL
              </span>
            }
          >
            <ul className="divide-y divide-outline-variant/40">
              {SAMPLE_LINKED_CANDIDATES.map((c) => (
                <li
                  key={c.id}
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
                      className={`block truncate text-sm font-medium ${
                        c.stage === "on_hold" ? "text-outline" : "text-on-surface"
                      }`}
                    >
                      {c.name}
                    </span>
                    <span className="block truncate text-xs text-outline">
                      {c.currentRole}
                    </span>
                  </span>
                  <span className="shrink-0 bg-surface-container-high px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
                    {EXEC_CANDIDATE_STAGE_LABELS[c.stage]}
                  </span>
                  <span className="w-full text-xs leading-relaxed text-outline sm:w-[200px]">
                    {c.chainNote}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-outline-variant/60 px-5 py-3.5">
              <Link
                href={CHAIN_HREF.Candidates}
                prefetch={false}
                className="font-mono-label text-[11px] uppercase tracking-widest text-primary hover:underline"
              >
                Open the diligence funnel {"→"}
              </Link>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Intake brief">
            <div className="flex flex-col gap-3.5 px-5 py-4">
              {SAMPLE_INTAKE_BRIEF.map((r) => (
                <div key={r.key}>
                  <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                    {r.key}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-on-surface-variant">
                    {r.value}
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
              {SAMPLE_EXECUTIVE_AUDIT.slice(0, 6).map((a, i) => (
                <li key={`${a.eventType}-${i}`} className="flex gap-3 px-5 py-2.5">
                  <span className="w-16 shrink-0 font-mono-label text-[11px] leading-relaxed tabular-nums text-outline">
                    Day {dayOf(a.daysAgo)}
                  </span>
                  <span className="min-w-0 text-xs leading-relaxed text-on-surface-variant">
                    {a.eventType} · {a.detail}
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
