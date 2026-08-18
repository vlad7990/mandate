import Link from "next/link";
import { IconInfo } from "@/components/icons";
import {
  EI_BASE,
  EiHeader,
  EiPanel,
  EiProvenance,
  EiReadOnlyNote,
  eiDayOf,
} from "@/components/sample/sample-ei-shell";
import {
  PROFILE_LIST_SECTIONS,
  PROFILE_TEXT_SECTIONS,
} from "@/lib/ai/executive-role-architect-agent";
import {
  SAMPLE_PROFILE_PROVENANCE,
  SAMPLE_SUCCESS_PROFILE,
  SAMPLE_WEIGHT_RATIONALE,
  SAMPLE_OPERATIONAL_WEIGHTS,
  sampleWorkedSearch,
} from "@/lib/sample";
import { DECISION_SUPPORT_DISCLAIMER } from "@/lib/executive/types";

/**
 * The approved success profile — one of the two screens in this module
 * that renders agent output.
 *
 * ## What the agent is allowed to say here, and why it is not D1
 *
 * The inventory held this screen for an unanswered question about what a
 * fabricated agent may say about a fabricated person. It says nothing
 * about a person: `SuccessProfileContent` has fifteen fields and not one
 * of them names, scores or characterises a candidate. The role-architect
 * agent's own header states the constraint — *"requirements describe the
 * ROLE, never a candidate"* — and the schema enforces it by having nowhere
 * to put a person.
 *
 * `potential_derailers` is the field that looks like the exception and is
 * not. Read the four in the fixture: each is a property of the job — no
 * line authority, two mandates pulling opposite ways, no bench, an
 * informal founder. They describe what this seat does to whoever sits in
 * it, which is the opposite of describing a candidate.
 *
 * ## Rendered through the product's own section metadata
 *
 * `PROFILE_TEXT_SECTIONS` and `PROFILE_LIST_SECTIONS` are the same
 * constants the real editor lays out from. A field added to the agent's
 * schema appears here without anyone remembering to add it — and, more to
 * the point, the sample cannot show a section the product does not have.
 */

const GAP_SECTIONS = new Set([
  "acceptable_gaps",
  "non_negotiable_gaps",
  "potential_derailers",
]);

export function SampleEiSuccessProfile() {
  const search = sampleWorkedSearch();
  const p = SAMPLE_SUCCESS_PROFILE;

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <EiHeader
        title="Success profile"
        crumbs={[
          { label: "Executive Intelligence", href: "/app/executive-intelligence" },
          { label: search.companyName, href: EI_BASE },
          { label: "Success profile" },
        ]}
        meta={[
          `${search.roleTitle} · ${search.companyName}`,
          `v${SAMPLE_PROFILE_PROVENANCE.version} approved`,
        ]}
        status={
          <span className="bg-primary/20 px-2.5 py-1.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
            Approved · read-only
          </span>
        }
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Decision support, said once, at the top, in the product's
              own words rather than a paraphrase. */}
          <div className="flex items-start gap-3 border border-outline-variant bg-surface-container-low p-4">
            <IconInfo size={15} className="mt-0.5 shrink-0 text-outline" />
            <p className="text-[13px] leading-relaxed text-outline">
              {DECISION_SUPPORT_DISCLAIMER}
            </p>
          </div>

          {/* Not "Role mission" — `PROFILE_TEXT_SECTIONS` already labels its
              first section that, and the heading repeated it. */}
          <EiPanel title="What the role requires">
            <div className="flex flex-col gap-4 px-5 py-5">
              {PROFILE_TEXT_SECTIONS.map((s) => {
                const value = p[s.key];
                if (typeof value !== "string" || value.length === 0) return null;
                return (
                  <div key={s.key}>
                    <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                      {s.label}
                    </p>
                    <p className="mt-2 max-w-[70ch] text-[16px] leading-[1.75] text-on-surface-variant">
                      {value}
                    </p>
                  </div>
                );
              })}
            </div>
          </EiPanel>

          <EiPanel
            title="Critical business outcomes"
            meta={
              <span className="font-mono-label text-[11px] tabular-nums text-outline">
                {p.critical_business_outcomes.length} STATED WITH EVIDENCE OF SUCCESS
              </span>
            }
          >
            <ul className="divide-y divide-outline-variant/40">
              {p.critical_business_outcomes.map((o) => (
                <li key={o.outcome} className="flex flex-col gap-2 px-5 py-4">
                  <p className="max-w-[70ch] text-[15px] leading-[1.7] text-on-surface">
                    {o.outcome}
                  </p>
                  <p className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-primary">
                    {o.timeframe}
                  </p>
                  <p className="max-w-[70ch] text-[13px] leading-relaxed text-outline">
                    <span className="uppercase">Evidence of success</span> —{" "}
                    {o.evidence_of_success}
                  </p>
                </li>
              ))}
            </ul>
          </EiPanel>

          {PROFILE_LIST_SECTIONS.map((s) => {
            const items = p[s.key];
            if (!Array.isArray(items) || items.length === 0) return null;
            return (
              <EiPanel
                key={s.key}
                title={s.label}
                dashed={GAP_SECTIONS.has(s.key)}
                meta={
                  <span className="font-mono-label text-[11px] tabular-nums text-outline">
                    {String(items.length).padStart(2, "0")}
                  </span>
                }
              >
                <ul className="flex flex-col gap-2.5 px-5 py-4">
                  {items.map((item) => (
                    <li
                      key={String(item)}
                      className="flex max-w-[72ch] gap-3 text-[14px] leading-[1.7] text-on-surface-variant"
                    >
                      <span aria-hidden className="shrink-0 text-outline-variant">
                        —
                      </span>
                      <span className="min-w-0">{String(item)}</span>
                    </li>
                  ))}
                </ul>
              </EiPanel>
            );
          })}
        </div>

        <div className="flex flex-col gap-5">
          <EiPanel
            title="Operational competency weights"
            meta={
              <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                Written on approval
              </span>
            }
          >
            <ul className="flex flex-col gap-4 px-5 py-4">
              {SAMPLE_OPERATIONAL_WEIGHTS.map((w) => (
                <li key={w.competency_key}>
                  <div className="flex justify-between gap-3 text-[13px] font-medium leading-snug text-on-surface-variant">
                    <span className="min-w-0">{w.label}</span>
                    <span className="font-mono-data shrink-0 tabular-nums">
                      {w.weight}%
                    </span>
                  </div>
                  <span aria-hidden className="mt-1.5 block h-1 bg-surface-container-high">
                    <span
                      className="block h-full bg-primary"
                      style={{ width: `${w.weight}%` }}
                    />
                  </span>
                  {/* A weight never travels without the reason for it —
                      the same rule the candidate detail set for scores. */}
                  <p className="mt-2 text-xs leading-relaxed text-outline">
                    {SAMPLE_WEIGHT_RATIONALE[w.competency_key]}
                  </p>
                </li>
              ))}
            </ul>
            <div className="border-t border-outline-variant/60 px-5 py-3.5">
              <Link
                href="/app/executive-intelligence/competencies"
                prefetch={false}
                className="font-mono-label text-[11px] uppercase tracking-widest text-primary hover:underline"
              >
                Open the competency library {"→"}
              </Link>
            </div>
          </EiPanel>

          <EiPanel title="Recommended interview stages">
            <ul className="divide-y divide-outline-variant/40">
              {p.recommended_interview_stages.map((s) => (
                <li key={s.stage} className="flex flex-col gap-1.5 px-5 py-3.5">
                  <p className="text-[13px] font-semibold text-on-surface">
                    {s.stage}
                  </p>
                  <p className="text-xs leading-relaxed text-on-surface-variant">
                    {s.focus}
                  </p>
                  <p className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-outline">
                    {s.format}
                  </p>
                </li>
              ))}
            </ul>
          </EiPanel>

          <div className="border border-outline-variant bg-surface-container-low">
            <EiProvenance
              items={[
                `approved day ${eiDayOf(SAMPLE_PROFILE_PROVENANCE.approvedDaysAgo)}`,
                `by ${SAMPLE_PROFILE_PROVENANCE.approvedByName}`,
                `version ${SAMPLE_PROFILE_PROVENANCE.version} · supersedes v${SAMPLE_PROFILE_PROVENANCE.supersedes}`,
                SAMPLE_PROFILE_PROVENANCE.promptVersion,
                SAMPLE_PROFILE_PROVENANCE.modelVersion,
              ]}
            />
          </div>

          <EiReadOnlyNote what="success profile" />
        </div>
      </div>
    </div>
  );
}
