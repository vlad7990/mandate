import { IconInfo } from "@/components/icons";
import {
  EI_BASE,
  EiChainGate,
  EiHeader,
  EiPanel,
  EiProvenance,
  EiReadOnlyNote,
  eiDayOf,
} from "@/components/sample/sample-ei-shell";
import { STAGE_LIST_FIELDS } from "@/lib/ai/executive-interview-architect-agent";
import type { InterviewStage } from "@/lib/ai/executive-interview-architect-agent";
import {
  SAMPLE_INTERVIEW_PLAN,
  SAMPLE_PLAN_PROVENANCE,
  SAMPLE_WORKED_CANDIDATE_ID,
  sampleLinkedCandidate,
  sampleWorkedSearch,
} from "@/lib/sample";
import { DECISION_SUPPORT_DISCLAIMER } from "@/lib/executive/types";

/**
 * The per-candidate interview plan — the second of the two screens in
 * this module that renders agent output, and the sharper of them.
 *
 * ## This is the whole of D1's real surface
 *
 * Everything else under `/app/executive-intelligence` reads a stored row
 * written by a person or computed in TypeScript. This is the one artifact
 * where an agent says something shaped by a *specific* candidate, so it is
 * the one place the question "what may a fabricated agent say about a
 * fabricated person" actually bites.
 *
 * The product had already answered it, in the interview architect's own
 * system prompt, and the fixture keeps to that answer rather than
 * inventing a second one:
 *
 * - **Questions gather evidence about a capability**, never about who
 *   somebody is. Read any `core_questions` entry: each asks the candidate
 *   to account for something they did.
 * - **Candidate-specific questions derive only from the record** — a scale
 *   figure, a sector move, a decision on the CV — and the prompt says to
 *   return an empty array rather than invent one. They ask a person to
 *   explain a fact, which is the opposite of asserting one about them.
 * - **Weak-answer indicators and red flags describe answer content.** The
 *   prompt states it outright: *"not the person's character"*. Every entry
 *   in the fixture is a property of a reply — an account that changes
 *   shape, a claim that does not survive follow-up — and none is a trait.
 *
 * That is the same line W6 found the comparison prompt already drawing,
 * and the same precedent `sample-candidate-detail.tsx` set: a judgement
 * never travels without the fact that produced it.
 *
 * ## Coverage is computed, never claimed
 *
 * `competency_coverage` comes from the stage assignments in the fixture,
 * the way the real generator computes it server-side. A plan cannot claim
 * to cover a competency no stage evaluates.
 */

const HEAT: Record<string, string> = {
  core_questions: "text-on-surface",
  follow_up_questions: "text-on-surface-variant",
  candidate_specific_questions: "text-on-surface-variant",
  evidence_to_listen_for: "text-on-surface-variant",
  weak_answer_indicators: "text-outline",
  red_flags: "text-outline",
};

function Stage({ s, n }: { s: InterviewStage; n: number }) {
  return (
    <EiPanel
      title={`${String(n).padStart(2, "0")} — ${s.stage_name}`}
      meta={
        <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.1em] tabular-nums text-outline">
          {s.duration_minutes} min · {s.recommended_interviewer_role}
        </span>
      }
    >
      <div className="flex flex-col gap-5 px-5 py-5">
        <p className="max-w-[70ch] text-[15px] leading-[1.7] text-on-surface">
          {s.objective}
        </p>

        <div className="flex flex-wrap gap-2">
          {s.assigned_competencies.map((k) => {
            const c = SAMPLE_INTERVIEW_PLAN.competency_coverage.find(
              (e) => e.competency_key === k
            );
            return (
              <span
                key={k}
                className="border border-outline-variant bg-surface-container px-2 py-1 font-mono-label text-[10px] uppercase tracking-[0.1em] text-on-surface-variant"
              >
                {c?.competency_name ?? k}
                {c && (
                  <span className="ml-1.5 tabular-nums text-outline">
                    {c.weight}%
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {/* Laid out from the product's own field metadata, so a field the
            agent stops producing stops appearing here too. */}
        {STAGE_LIST_FIELDS.map((f) => {
          const items = s[f.key];
          if (!Array.isArray(items) || items.length === 0) return null;
          return (
            <div key={f.key}>
              <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                {f.label}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {items.map((item) => (
                  <li
                    key={item}
                    className={`flex max-w-[72ch] gap-3 text-[14px] leading-[1.7] ${
                      HEAT[f.key] ?? "text-on-surface-variant"
                    }`}
                  >
                    <span aria-hidden className="shrink-0 text-outline-variant">
                      —
                    </span>
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </EiPanel>
  );
}

export function SampleEiInterviewPlan({ candidateId }: { candidateId: string }) {
  const search = sampleWorkedSearch();
  const candidate = sampleLinkedCandidate(candidateId);
  const crumbs = [
    { label: "Executive Intelligence", href: "/app/executive-intelligence" },
    { label: search.companyName, href: EI_BASE },
    { label: "Candidates", href: `${EI_BASE}/candidates` },
    { label: "Interview plan" },
  ];

  // Only the worked candidate carries a plan in the fixture. The rest get
  // the state a real workspace would show them, not a "not built" notice.
  if (!candidate) {
    return (
      <EiChainGate
        title="Interview plan"
        crumbs={crumbs}
        candidateName="This candidate"
        artifact="interview plan"
        reason="This candidate is not linked to the sample search."
        unlocks="Interview plans are generated per candidate from the approved success profile."
      />
    );
  }

  if (candidateId !== SAMPLE_WORKED_CANDIDATE_ID) {
    const drafting = candidate.planStatus === "draft";
    return (
      <EiChainGate
        title="Interview plan"
        crumbs={crumbs}
        candidateName={candidate.name}
        artifact={drafting ? "approved interview plan" : "interview plan"}
        reason={
          drafting
            ? `${candidate.name}'s plan has been generated and is still in draft. A draft is editable and cannot be used to open an assessment.`
            : `No interview plan has been generated for ${candidate.name} yet.`
        }
        unlocks={
          drafting
            ? "Approving a plan freezes it at a version and unlocks the assessment for this candidate."
            : "A plan is generated per candidate from the approved success profile, then reviewed and approved by a person."
        }
      />
    );
  }

  const plan = SAMPLE_INTERVIEW_PLAN;
  const totalMinutes = plan.stages.reduce((s, x) => s + x.duration_minutes, 0);

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <EiHeader
        title="Interview plan"
        crumbs={crumbs}
        meta={[
          candidate.name,
          `${search.roleTitle} · ${search.companyName}`,
          `v${SAMPLE_PLAN_PROVENANCE.version} approved`,
        ]}
        status={
          <span className="bg-primary/20 px-2.5 py-1.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
            Approved · read-only
          </span>
        }
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex items-start gap-3 border border-outline-variant bg-surface-container-low p-4">
            <IconInfo size={15} className="mt-0.5 shrink-0 text-outline" />
            <p className="text-[13px] leading-relaxed text-outline">
              {DECISION_SUPPORT_DISCLAIMER}
            </p>
          </div>

          <EiPanel
            title="Overview"
            meta={
              <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.1em] tabular-nums text-outline">
                {plan.stages.length} stages · {totalMinutes} min
              </span>
            }
          >
            <p className="max-w-[70ch] px-5 py-5 text-[16px] leading-[1.75] text-on-surface-variant">
              {plan.overview}
            </p>
          </EiPanel>

          {plan.stages.map((s, i) => (
            <Stage key={s.stage_name} s={s} n={i + 1} />
          ))}
        </div>

        <div className="flex flex-col gap-5">
          <EiPanel
            title="Competency coverage"
            meta={
              <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                Computed
              </span>
            }
          >
            <ul className="flex flex-col gap-3.5 px-5 py-4">
              {plan.competency_coverage.map((c) => (
                <li key={c.competency_key}>
                  <div className="flex justify-between gap-3 text-[13px] leading-snug text-on-surface-variant">
                    <span className="min-w-0">{c.competency_name}</span>
                    <span className="font-mono-data shrink-0 tabular-nums">
                      {c.weight}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-outline">
                    {c.covered_by.length > 0
                      ? c.covered_by.join(" · ")
                      : "Not covered by any stage"}
                  </p>
                </li>
              ))}
            </ul>
            <p className="border-t border-outline-variant/60 px-5 py-3.5 text-xs leading-relaxed text-outline">
              Computed from the stage assignments rather than claimed by the
              plan. A competency no stage evaluates is reported as uncovered.
            </p>
          </EiPanel>

          <div className="border border-outline-variant bg-surface-container-low">
            <EiProvenance
              items={[
                `approved day ${eiDayOf(SAMPLE_PLAN_PROVENANCE.approvedDaysAgo)}`,
                `by ${SAMPLE_PLAN_PROVENANCE.approvedByName}`,
                `version ${SAMPLE_PLAN_PROVENANCE.version} · supersedes v${SAMPLE_PLAN_PROVENANCE.supersedes}`,
                SAMPLE_PLAN_PROVENANCE.promptVersion,
                SAMPLE_PLAN_PROVENANCE.modelVersion,
              ]}
            />
          </div>

          <EiReadOnlyNote what="interview plan" />
        </div>
      </div>
    </div>
  );
}
