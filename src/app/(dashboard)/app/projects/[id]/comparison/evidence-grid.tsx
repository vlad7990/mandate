import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DimensionKey } from "@/lib/ai/onboarding-analysis";
import {
  blindSpots,
  type ComparisonGrid,
  type CoverageState,
  type DimensionCoverage,
  type EvidenceBasis,
} from "@/lib/comparison/evidence-index";
import { IconAlert, IconCheck, IconInfo, IconMinus } from "@/components/icons";

/**
 * The evidence grid — dimensions down, candidates across.
 *
 * Read the cell legend before changing anything here. The grid's whole claim is
 * that it distinguishes four things a scores table renders identically:
 *
 *   evidenced   we looked and found something
 *   thin        only the candidate's own account
 *   conflicted  we looked and the sources disagree
 *   absent      we never looked
 *
 * The last one is the point. A blank cell is a gap in the SEARCH, not a low
 * score for the person, and rendering it as a dash rather than a number is what
 * stops a candidate being rejected for a silence.
 */

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  technical: "Technical depth",
  domain: "Domain expertise",
  leadership: "Leadership scale",
  regulatory: "Regulatory exposure",
  transformation: "Transformation record",
};

const STATE_TONE: Record<CoverageState, string> = {
  evidenced:
    "border-secondary-fixed-dim/50 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  thin: "border-tertiary/50 bg-tertiary/10 text-tertiary",
  conflicted: "border-error/60 bg-error/10 text-error",
  absent: "border-outline-variant text-outline",
};

const STATE_LABEL: Record<CoverageState, string> = {
  evidenced: "Evidenced",
  thin: "Their account only",
  conflicted: "Sources disagree",
  absent: "Not assessed",
};

const BASIS_LABEL: Record<EvidenceBasis, string> = {
  measured: "Scored",
  recruiter: "Recruiter",
  ai_inferred: "AI read",
  self_reported: "CV",
};

/**
 * Who is reading.
 *
 * `internal` shows each cell's evidence items verbatim — including the
 * recruiter's own per-dimension notes, which are working commentary written
 * for their file.
 *
 * `client` shows coverage STATE and gaps only. The distinction follows the
 * precedent already set by buildPortalCandidate, which hands a hiring manager
 * the recruiter's tier but never their fit_notes: the coverage picture is an
 * honest disclosure the client is owed, the candid sentence behind it is not
 * theirs to read. "Sources disagree on domain expertise" is useful to a hiring
 * manager; "impressive CV, thin in person" is a note to self.
 */
export type EvidenceGridVariant = "internal" | "client";

export function EvidenceGrid({
  projectId,
  grid,
  variant = "internal",
}: {
  projectId?: string;
  grid: ComparisonGrid;
  variant?: EvidenceGridVariant;
}) {
  if (grid.candidates.length === 0) {
    return (
      <section className="bg-surface-container-low border border-outline-variant p-6">
        <p className="text-body-main text-on-surface-variant">
          Nothing to compare yet. Add candidates to this search and the grid
          fills in as evidence accumulates.
        </p>
      </section>
    );
  }

  const spots = blindSpots(grid);

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <IconCheck size={14} />
          EVIDENCE_GRID · what we know, per dimension
        </h2>
        <Legend />
      </header>

      {spots.length > 0 && (
        <div className="flex items-start gap-2 border border-tertiary/50 bg-tertiary/10 px-3 py-2 text-tertiary">
          <IconAlert size={14} className="mt-0.5 shrink-0" />
          <p className="font-mono-data text-body-main leading-snug">
            No candidate has evidence on{" "}
            <strong>
              {spots.map((s) => DIMENSION_LABELS[s].toLowerCase()).join(", ")}
            </strong>
            . That is a gap in the search rather than in the people — every
            candidate looks equally unproven there because nobody was tested on
            it.
          </p>
        </div>
      )}

      <div className="overflow-x-auto border border-outline-variant">
        <table className="w-full border-collapse min-w-[40rem]">
          <thead>
            <tr className="bg-surface-container-high">
              <th className="text-left px-3 py-2 font-mono-label text-mono-label text-outline uppercase tracking-widest whitespace-nowrap">
                Dimension
              </th>
              {grid.candidates.map((c) => (
                <th
                  key={c.candidate_id}
                  className="text-left px-3 py-2 font-mono-label text-mono-label text-on-surface uppercase tracking-widest"
                >
                  {projectId ? (
                    <Link
                      href={`/app/projects/${projectId}/candidates/${c.candidate_id}`}
                      prefetch={false}
                      className="hover:text-primary transition-colors"
                    >
                      {c.full_name}
                    </Link>
                  ) : (
                    c.full_name
                  )}
                  {c.critical_gaps.length > 0 && (
                    <span className="block mt-0.5 text-tertiary normal-case tracking-normal font-mono-data text-body-main">
                      {c.critical_gaps.length} critical gap
                      {c.critical_gaps.length === 1 ? "" : "s"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/40">
            {grid.rows.map((row) => (
              <tr
                key={row.dimension}
                className={cn(row.differentiating && "bg-surface-container-low")}
              >
                <th className="text-left align-top px-3 py-2.5 font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest whitespace-nowrap">
                  {DIMENSION_LABELS[row.dimension]}
                  <span className="block text-outline tabular-nums">
                    {row.weight === null ? "unweighted" : `weight ${row.weight}`}
                    {row.differentiating ? " · differentiates" : ""}
                  </span>
                </th>
                {row.cells.map((cell) => (
                  <td
                    key={cell.candidate_id}
                    className="align-top px-3 py-2.5"
                  >
                    <Cell coverage={cell.coverage} variant={variant} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ContextNote variant={variant} />
    </section>
  );
}

function Cell({
  coverage,
  variant,
}: {
  coverage: DimensionCoverage;
  variant: EvidenceGridVariant;
}) {
  if (coverage.state === "absent") {
    // A dash, never a zero. "We did not look" and "they scored badly" are
    // different claims and only one of them is true here.
    return (
      <span className="flex items-center gap-1.5 font-mono-label text-mono-label text-outline uppercase tracking-widest">
        <IconMinus size={12} />
        Not assessed
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-1.5 py-0 border",
          "font-mono-label text-mono-label uppercase tracking-widest",
          STATE_TONE[coverage.state]
        )}
      >
        {coverage.state === "conflicted" && <IconAlert size={12} />}
        {STATE_LABEL[coverage.state]}
        {coverage.best_basis && (
          <span className="opacity-70">· {BASIS_LABEL[coverage.best_basis]}</span>
        )}
      </span>
      {variant === "client" ? null : (
      <ul className="space-y-0.5">
        {coverage.items.slice(0, 3).map((item, i) => (
          <li
            key={i}
            className={cn(
              "font-mono-data text-body-main leading-snug",
              item.polarity === "contradicts"
                ? "text-error"
                : "text-on-surface-variant"
            )}
          >
            {item.polarity === "contradicts" ? "− " : "· "}
            {item.summary}
          </li>
        ))}
        {coverage.items.length > 3 && (
          <li className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            +{coverage.items.length - 3} more
          </li>
        )}
      </ul>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap font-mono-label text-mono-label uppercase tracking-widest">
      {(["evidenced", "thin", "conflicted", "absent"] as CoverageState[]).map(
        (state) => (
          <span
            key={state}
            className={cn("px-1.5 py-0 border", STATE_TONE[state])}
          >
            {STATE_LABEL[state]}
          </span>
        )
      )}
    </div>
  );
}

/**
 * Names what the grid cannot show. Without this the omission reads as "these
 * assets do not exist" rather than "they do not make dimension-level claims".
 */
function ContextNote({ variant }: { variant: EvidenceGridVariant }) {
  if (variant === "client") {
    return (
      <p className="font-mono-data text-body-main text-on-surface-variant flex items-start gap-1.5">
        <IconInfo size={12} className="mt-0.5 shrink-0" />
        <span>
          This shows how well each dimension is evidenced, not a verdict.
          &ldquo;Not assessed&rdquo; means the search has not tested it yet —
          it is not a mark against the candidate.
        </span>
      </p>
    );
  }

  return (
    <p className="font-mono-data text-body-main text-on-surface-variant flex items-start gap-1.5">
      <IconInfo size={12} className="mt-0.5 shrink-0" />
      <span>
        The psychology profile, culture match, triangulation and risk review are
        not on this grid. They describe the whole person rather than any one
        dimension, and splitting them across columns would invent judgements
        they never made — read them on each candidate&rsquo;s own page.
      </span>
    </p>
  );
}
