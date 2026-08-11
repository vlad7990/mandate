import Link from "next/link";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconArrowRight } from "@/components/icons";
import {
  SAMPLE_CANDIDATES,
  SAMPLE_DISMISSED_COOKIE,
  SAMPLE_MANDATES,
  shouldShowSample,
} from "@/lib/sample";

/**
 * Every candidate across every mandate.
 *
 * Three rules carried over from the comp, all of which are really about
 * honesty rather than styling:
 *
 * - **Partial data is normal.** A CV still parsing and a candidate found
 *   but not yet scored both appear inline with honest placeholders. The
 *   alternative — hiding a row until it is complete — makes the count
 *   wrong and the upload look lost.
 * - **Tier is a band, not a grade.** Tier 1 carries the accent; 2–4 stay
 *   neutral. Nothing is red, because a tier-3 candidate is not a
 *   failure, and colouring them as one is the traffic-light problem the
 *   marketing surface was corrected for.
 * - **Dedupe is visible.** The network view states how each merge
 *   happened, so a wrong merge can be found rather than silently
 *   trusted.
 */

type ProjectLite = {
  id: string;
  title: string;
  company_name: string;
};

type CandidateLite = {
  id: string;
  project_id: string | null;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  cv_processing: boolean;
  updated_at: string;
};

type ScoreLite = {
  candidate_id: string;
  overall_score: number | null;
  tier: string | null;
};

export const metadata = { title: "Candidates" };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Coarse relative time. Exactness is not the point on this column. */
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "NOW";
  if (h < 24) return `${h}H AGO`;
  const d = Math.floor(h / 24);
  return `${d}D AGO`;
}

function tierNumber(tier: string | null): number | null {
  if (!tier) return null;
  const m = tier.match(/\d/);
  return m ? Number(m[0]) : null;
}

function TierBadge({ tier }: { tier: number | null }) {
  if (tier === null) {
    return <span className="text-xs text-outline">Not scored</span>;
  }
  // Only tier 1 is accented. No tier is ever red.
  const lead = tier === 1;
  return (
    <span
      className={`rounded-md px-2 py-1 font-mono-label text-[10px] font-bold uppercase tracking-[0.08em] ${
        lead
          ? "bg-primary/20 text-primary"
          : "bg-surface-container-high text-on-surface-variant"
      }`}
    >
      Tier {tier}
    </span>
  );
}

function Avatar({ name, parsing }: { name: string; parsing?: boolean }) {
  if (parsing) {
    return (
      <span
        aria-hidden
        className="h-[30px] w-[30px] shrink-0 rounded-lg border border-dashed border-outline-variant bg-surface-container"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-high font-mono-label text-[10px] font-semibold text-on-surface-variant"
    >
      {initials(name)}
    </span>
  );
}

/** Placeholder bar for a value that does not exist yet. */
function Pending({ w }: { w: number }) {
  return (
    <span
      aria-hidden
      className="block h-2.5 rounded-full bg-surface-container-high"
      style={{ width: w }}
    />
  );
}

const HEAD = [
  "Candidate",
  "Mandate",
  "Archetype",
  "Tier",
  "Fit",
  "Stage",
  "Updated",
];

export default async function CandidatesPage() {
  const supabase = await createServerSupabaseClient();
  const [projectsQ, candidatesQ, scoresQ] = await Promise.all([
    supabase.from("projects").select("id, title, company_name"),
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, current_title, current_company, archetype, pipeline_stage, cv_processing, updated_at"
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("candidate_scores")
      .select("candidate_id, overall_score, tier"),
  ]);

  const projects = (projectsQ.data ?? []) as ProjectLite[];
  const candidates = (candidatesQ.data ?? []) as CandidateLite[];
  const scores = (scoresQ.data ?? []) as ScoreLite[];

  const dismissed =
    (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  const showSample = shouldShowSample({
    hasRealData: candidates.length > 0,
    dismissed,
  });

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const scoreByCandidate = new Map(scores.map((s) => [s.candidate_id, s]));
  const mandateById = new Map(SAMPLE_MANDATES.map((m) => [m.id, m]));

  const distinct = new Set(
    candidates.map((c) =>
      `${c.full_name}|${c.current_company ?? ""}`.toLowerCase()
    )
  ).size;

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <SetBreadcrumbs crumbs={[{ label: "Candidates" }]} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-on-surface">
            Candidates
          </h1>
          <p className="mt-1.5 text-sm text-on-surface-variant">
            {showSample
              ? `${SAMPLE_CANDIDATES.length} example rows across ${SAMPLE_MANDATES.length} mandates`
              : `${candidates.length} ${candidates.length === 1 ? "row" : "rows"} across ${projects.length} ${projects.length === 1 ? "mandate" : "mandates"} · ${distinct} distinct ${distinct === 1 ? "person" : "people"}`}
          </p>
        </div>
        <Link
          href="/app/projects"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-primary bg-primary px-4 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Upload CVs
          <IconArrowRight size={15} />
        </Link>
      </div>

      {showSample && (
        <div className="mt-5">
          <SampleBanner scope="candidates" />
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse tabular-nums">
            <caption className="sr-only">
              {showSample
                ? "Example candidates with mandate, archetype, tier, fit and stage."
                : "Candidates with mandate, archetype, tier, fit and stage."}
            </caption>
            <thead>
              <tr>
                {HEAD.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="border-b border-outline-variant px-3 py-3 text-left font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline first:pl-[18px] last:pr-[18px]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {showSample
                ? SAMPLE_CANDIDATES.map((c) => {
                    const m = mandateById.get(c.mandateId);
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-outline-variant/40 last:border-0"
                      >
                        <td className="px-3 py-3 pl-[18px]">
                          <div className="flex items-center gap-3">
                            <Avatar name={c.name} parsing={c.parsing} />
                            <div className="min-w-0">
                              <span
                                className={`block truncate text-[13px] font-medium ${c.parsing ? "text-outline" : "text-on-surface"}`}
                              >
                                {c.name}
                              </span>
                              <span className="block truncate text-xs text-outline">
                                {c.parsing
                                  ? c.fileName
                                  : `${c.currentTitle} · ${c.currentCompany}`}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-on-surface-variant">
                          {m ? `${m.title} · ${m.company}` : "—"}
                        </td>
                        <td className="px-3 py-3">
                          {c.parsing ? (
                            <Pending w={72} />
                          ) : c.archetype ? (
                            <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-[11px] font-medium text-on-surface-variant">
                              {c.archetype}
                            </span>
                          ) : (
                            <span className="text-xs text-outline">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {c.parsing ? <Pending w={48} /> : <TierBadge tier={c.tier} />}
                        </td>
                        <td className="px-3 py-3 font-mono-data text-[13px] text-on-surface">
                          {c.parsing ? (
                            <Pending w={24} />
                          ) : c.fit === null ? (
                            <span className="text-outline">—</span>
                          ) : (
                            c.fit
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-on-surface-variant">
                          {c.stage}
                        </td>
                        <td className="px-3 py-3 pr-[18px] font-mono-label text-[11px] text-outline">
                          {c.updated}
                        </td>
                      </tr>
                    );
                  })
                : candidates.map((c) => {
                    const p = c.project_id
                      ? projectById.get(c.project_id)
                      : undefined;
                    const s = scoreByCandidate.get(c.id);
                    const tier = tierNumber(s?.tier ?? null);
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-outline-variant/40 last:border-0"
                      >
                        <td className="px-3 py-3 pl-[18px]">
                          <Link
                            href={
                              c.project_id
                                ? `/app/projects/${c.project_id}/candidates/${c.id}`
                                : "/app/candidates"
                            }
                            className="flex items-center gap-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <Avatar
                              name={c.full_name}
                              parsing={c.cv_processing}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-on-surface">
                                {c.full_name}
                              </span>
                              <span className="block truncate text-xs text-outline">
                                {c.cv_processing
                                  ? "Parsing CV…"
                                  : [c.current_title, c.current_company]
                                      .filter(Boolean)
                                      .join(" · ") || "—"}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-xs text-on-surface-variant">
                          {p ? `${p.title} · ${p.company_name}` : "—"}
                        </td>
                        <td className="px-3 py-3">
                          {c.cv_processing ? (
                            <Pending w={72} />
                          ) : c.archetype ? (
                            <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-[11px] font-medium text-on-surface-variant">
                              {c.archetype}
                            </span>
                          ) : (
                            <span className="text-xs text-outline">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {c.cv_processing ? (
                            <Pending w={48} />
                          ) : (
                            <TierBadge tier={tier} />
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono-data text-[13px] text-on-surface">
                          {c.cv_processing ? (
                            <Pending w={24} />
                          ) : s?.overall_score == null ? (
                            <span className="text-outline">—</span>
                          ) : (
                            Math.round(s.overall_score)
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs capitalize text-on-surface-variant">
                          {c.cv_processing
                            ? "Parsing"
                            : (c.pipeline_stage ?? "—").replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-3 pr-[18px] font-mono-label text-[11px] text-outline">
                          {ago(c.updated_at)}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!showSample && candidates.length === 0 && (
          <p className="px-[18px] py-10 text-center text-sm text-outline">
            No candidates yet. Open a mandate and upload CVs to get started.
          </p>
        )}
      </div>
    </div>
  );
}
