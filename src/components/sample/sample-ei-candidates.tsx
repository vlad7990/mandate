import Link from "next/link";
import {
  EI_BASE,
  EiHeader,
  EiPanel,
  EiReadOnlyNote,
  eiDayOf,
} from "@/components/sample/sample-ei-shell";
import {
  SAMPLE_LINKED_CANDIDATES,
  sampleStageCounts,
  sampleWorkedSearch,
  type SampleLinkedCandidate,
} from "@/lib/sample";
import {
  EXEC_CANDIDATE_STAGES,
  EXEC_CANDIDATE_STAGE_LABELS,
} from "@/lib/executive/types";

/**
 * The diligence funnel — who is linked to this search and where each of
 * them has reached in the chain.
 *
 * No agent output at all: this screen reads `executive_search_candidates`
 * joined to the pool. The inventory classified it `relational`, which was
 * right, and then listed it behind D1, which was not.
 *
 * **A stage is not a verdict**, and the product says so in the type:
 * `ExecutiveCandidateStage` is commented *"Due-diligence funnel position —
 * never a hiring decision"*. So this screen shows where somebody is in a
 * process and what artifacts exist for them, and nothing about how they
 * are doing. "On hold" carries its reason — paused at the candidate's own
 * request — because a stage without its reason invites the reader to
 * supply one.
 *
 * Counts come from `sampleStageCounts()`. Nothing here is typed twice.
 */

function chainCell(state: "approved" | "draft" | "none", href: string | null) {
  const label =
    state === "approved" ? "Approved" : state === "draft" ? "Draft" : "Not started";
  const tone =
    state === "approved"
      ? "text-primary"
      : state === "draft"
        ? "text-on-surface-variant"
        : "text-outline";

  const body = (
    <span
      className={`font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] ${tone}`}
    >
      {label}
    </span>
  );

  return href ? (
    <Link href={href} prefetch={false} className="hover:underline">
      {body}
    </Link>
  ) : (
    body
  );
}

function CandidateRow({ c }: { c: SampleLinkedCandidate }) {
  const base = `${EI_BASE}/candidates/${c.id}`;
  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span
          aria-hidden
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center border border-outline-variant bg-surface-container-high font-mono-label text-[11px] font-semibold text-on-surface-variant"
        >
          {c.initials}
        </span>
        <span className="min-w-0 flex-1 basis-[180px]">
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
        <span className="shrink-0 font-mono-label text-[10px] uppercase tracking-[0.1em] tabular-nums text-outline">
          Linked day {eiDayOf(c.linkedDaysAgo)}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-outline">{c.chainNote}</p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-outline-variant/40 pt-3">
        <span className="flex items-center gap-2">
          <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-outline">
            Interview plan
          </span>
          {chainCell(c.planStatus, `${base}/interview-plan`)}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-outline">
            Assessment
          </span>
          {chainCell(c.assessmentStatus, `${base}/assessment`)}
        </span>
        {c.assessmentStatus === "approved" && (
          <Link
            href={`${base}/report`}
            prefetch={false}
            className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-primary hover:underline"
          >
            Open report {"→"}
          </Link>
        )}
      </div>
    </li>
  );
}

export function SampleEiCandidates() {
  const search = sampleWorkedSearch();
  const counts = sampleStageCounts();
  const present = EXEC_CANDIDATE_STAGES.filter((s) => counts[s] > 0);

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <EiHeader
        title="Candidates"
        crumbs={[
          { label: "Executive Intelligence", href: "/app/executive-intelligence" },
          { label: search.companyName, href: EI_BASE },
          { label: "Candidates" },
        ]}
        meta={[
          `${search.roleTitle} · ${search.companyName}`,
          `${SAMPLE_LINKED_CANDIDATES.length} linked`,
        ]}
      />

      {/* Stage tiles, derived. Only stages that actually hold somebody are
          shown — a row of zeroes reads as a taxonomy lesson. */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {present.map((s) => (
          <div
            key={s}
            className="border border-outline-variant bg-surface-container-low px-4 py-3"
          >
            <p className="font-mono-data text-[22px] leading-none tabular-nums text-on-surface">
              {String(counts[s]).padStart(2, "0")}
            </p>
            <p className="mt-1.5 font-mono-label text-[10px] uppercase tracking-[0.1em] text-outline">
              {EXEC_CANDIDATE_STAGE_LABELS[s]}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-5">
        <EiPanel
          title="Linked candidates"
          meta={
            <span className="font-mono-label text-[11px] uppercase tracking-wider text-outline">
              A stage is a position in diligence, never a decision
            </span>
          }
        >
          <ul className="divide-y divide-outline-variant/40">
            {SAMPLE_LINKED_CANDIDATES.map((c) => (
              <CandidateRow key={c.id} c={c} />
            ))}
          </ul>
        </EiPanel>

        <EiReadOnlyNote what="diligence funnel" />
      </div>
    </div>
  );
}
