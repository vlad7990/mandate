import Link from "next/link";
import { MastHead } from "@/components/ui/mast-head";
import { StatusChip } from "@/components/ui/status-chip";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Panel, PanelMeta, PANEL_BODY } from "@/components/projects/panel";
import {
  SampleModuleNotBuilt,
  SampleModuleShell,
} from "@/components/sample/sample-mandate-shell";
import {
  SAMPLE_CALIBRATION_HISTORY,
  SAMPLE_FEEDBACK,
  SAMPLE_HM,
  SAMPLE_MANDATE_ID,
  SAMPLE_METRICS,
  SAMPLE_ONBOARDING,
  SAMPLE_REPORTS,
  SAMPLE_SPEC,
  sampleFunnel,
  sampleModuleMandate,
  type SampleCalibrationSnapshot,
} from "@/lib/sample";

/**
 * The seven sample module screens — W3.
 *
 * Each mirrors the structure of the real route rather than inventing a
 * layout, because a sample whose job is teaching has to teach the screen the
 * reader will actually meet. Where the real screen has a write control, this
 * one has nothing: the read-only rule from `5107767` and W2.
 *
 * All of them are server components and none of them queries.
 *
 * Each takes the sample id it was reached from and refuses to render for any
 * mandate but `sample-larkspur`. The fixtures describe one search; showing
 * Larkspur\'s spec under a Cindermere URL would be a quieter lie than the
 * redirect this replaced.
 *
 * The AI-output rule is enforced in the fixture rather than here — see the
 * header of `src/lib/sample/mandate-modules.ts`. What this file is
 * responsible for is that **a score is never rendered without the evidence
 * beside it**, which is the shape `sample-candidate-detail.tsx` set and the
 * reason a number reads as an input rather than a verdict.
 */

function days(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 30) return `${n}d ago`;
  const months = Math.round(n / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** A bordered block with a mono heading — the shape every module reuses. */
function Block({
  heading,
  meta,
  children,
}: {
  heading: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <MastHead tone="neutral" label={heading} meta={meta} />
      {children}
    </section>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main leading-relaxed text-on-surface">
      {children}
    </p>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
      {items.map((t) => (
        <li key={t} className="px-4 py-2.5 text-body-main leading-relaxed text-on-surface">
          {t}
        </li>
      ))}
    </ul>
  );
}

/* ── Onboarding ──────────────────────────────────────────────────── */

export function SampleOnboarding({ id }: { id: string }) {
  if (id !== SAMPLE_MANDATE_ID) {
    return <SampleModuleNotBuilt module="onboarding" mandateId={id} />;
  }

  const o = SAMPLE_ONBOARDING;

  return (
    <SampleModuleShell
      module="onboarding"
      title="ONBOARDING"
      meta={`5 of 5 steps // completed ${days(o.completedDaysAgo)}`}
    >
      {/*
        The real route is a five-step wizard with a Compile button at the
        end. This is the completed record instead of an empty form: a wizard
        whose submit cannot fire teaches a control that does not work, and
        what a reader wants from the sample is to see what onboarding
        actually captures.
      */}
      <p className="border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main leading-relaxed text-on-surface-variant">
        What the five steps captured. On your own mandate this is the wizard;
        here it is the record it produced, which is what the calibration model
        below it was derived from.
      </p>

      <Block heading="Origin" meta={o.origin.kind}>
        <Prose>{o.origin.detail}</Prose>
      </Block>

      <Block heading="Must-haves" meta={`${o.mustHaves.length} stated`}>
        <Bullets items={o.mustHaves} />
      </Block>

      <Block heading="Anti-patterns" meta={`${o.antiPatterns.length} stated`}>
        <Bullets items={o.antiPatterns} />
      </Block>

      <Block heading="Stakeholders" meta={`${o.stakeholders.length} named`}>
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {o.stakeholders.map((s) => (
            <li key={s.name} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1 basis-[200px]">
                <p className="text-body-main text-on-surface">{s.name}</p>
                <p className="mt-0.5 text-body-s text-on-surface-variant">{s.title}</p>
              </div>
              <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                {s.role}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block heading="Weighted priorities" meta="1–5, set by the recruiter">
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {o.priorities.map((p) => (
            <li key={p.name} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-body-main text-on-surface">
                {p.name}
              </span>
              <span className="font-mono-data text-[13px] tabular-nums text-outline">
                {p.weight} / 5
              </span>
              <span
                aria-hidden
                className="h-1.5 w-[84px] shrink-0 bg-outline-variant"
              >
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${(p.weight / 5) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      </Block>
    </SampleModuleShell>
  );
}

/* ── Job spec ────────────────────────────────────────────────────── */

export function SampleSpec({ id }: { id: string }) {
  if (id !== SAMPLE_MANDATE_ID) {
    return <SampleModuleNotBuilt module="spec" mandateId={id} />;
  }

  const s = SAMPLE_SPEC;

  return (
    <SampleModuleShell
      module="spec"
      title="JOB_SPEC"
      meta={`${s.label} // ${s.characters.toLocaleString("en-GB")} characters // finalised ${days(s.finalisedDaysAgo)}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone="primary" intensity="filled">
          {s.label}
        </StatusChip>
        <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
          Generated {days(s.generatedDaysAgo)} · edited by the recruiter before
          finalising
        </span>
      </div>

      <article className="space-y-5 border border-outline-variant bg-surface-container-low px-5 py-5">
        {s.sections.map((sec) => (
          <section key={sec.heading} className="space-y-2">
            <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
              {sec.heading}
            </h2>
            <p className="text-body-main leading-relaxed text-on-surface">
              {sec.body}
            </p>
          </section>
        ))}
      </article>

      {/*
        The disclaimer the real spec editor carries. A generated spec is a
        draft a recruiter owns and edits, and saying so on the sample is the
        difference between demonstrating a drafting tool and implying the
        product writes the role.
      */}
      <p className="font-mono-label text-[11px] uppercase leading-[1.6] tracking-[0.08em] text-outline">
        Drafted by the role-spec agent // edited and finalised by a human //
        every version is kept
      </p>
    </SampleModuleShell>
  );
}

/* ── Calibration history ─────────────────────────────────────────── */

function WeightRow({
  snapshot,
}: {
  snapshot: SampleCalibrationSnapshot;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {snapshot.weights.map((w) => {
        const moved = snapshot.changed.includes(w.name);
        return (
          <li
            key={w.name}
            className={`border px-2 py-0.5 font-mono-label text-mono-label uppercase tracking-widest tabular-nums ${
              moved
                ? "border-primary/60 bg-primary/[0.08] text-primary"
                : "border-outline-variant text-on-surface-variant"
            }`}
          >
            {w.name} {w.weight}
          </li>
        );
      })}
    </ul>
  );
}

export function SampleCalibrationHistory({ id }: { id: string }) {
  if (id !== SAMPLE_MANDATE_ID) {
    return <SampleModuleNotBuilt module="calibration-history" mandateId={id} />;
  }

  const history = SAMPLE_CALIBRATION_HISTORY;

  return (
    <SampleModuleShell
      module="calibration-history"
      title="CALIBRATION_HISTORY"
      meta={`${history.length} versions // current v${history[0].version}`}
    >
      <p className="border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main leading-relaxed text-on-surface-variant">
        Every version is kept, with what triggered it and why the weights
        moved. A score from March is only readable against the model that
        produced it, which is why nothing here is overwritten.
      </p>

      <ol className="space-y-3 border-l border-outline-variant pl-4">
        {history.map((s, i) => (
          <li key={s.id} className="relative">
            <span
              aria-hidden
              className={`absolute -left-[21px] top-2 h-2 w-2 ${
                i === 0 ? "bg-primary" : "bg-outline-variant"
              }`}
            />
            <article className="space-y-2.5 border border-outline-variant bg-surface-container-low px-4 py-3">
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={`border px-1.5 font-mono-label text-mono-label uppercase tracking-widest tabular-nums ${
                      i === 0
                        ? "border-primary/60 text-primary"
                        : "border-outline-variant text-on-surface-variant"
                    }`}
                  >
                    V{String(s.version).padStart(2, "0")}
                  </span>
                  <span className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface">
                    {s.trigger}
                  </span>
                  {i === 0 && (
                    <StatusChip tone="primary" intensity="soft">
                      Current
                    </StatusChip>
                  )}
                </div>
                <span className="font-mono-label text-mono-label uppercase tracking-widest tabular-nums text-outline">
                  {days(s.daysAgo)}
                </span>
              </header>

              <p className="text-body-main leading-relaxed text-on-surface">
                {s.rationale}
              </p>

              <WeightRow snapshot={s} />
            </article>
          </li>
        ))}
      </ol>
    </SampleModuleShell>
  );
}

/* ── Metrics ─────────────────────────────────────────────────────── */

const SEVERITY_TONE = {
  attention: "border-tertiary/50 bg-tertiary/[0.06]",
  routine: "border-outline-variant bg-surface-container-low",
} as const;

export function SampleMetrics({ id }: { id: string }) {
  if (id !== SAMPLE_MANDATE_ID) {
    return <SampleModuleNotBuilt module="metrics" mandateId={id} />;
  }

  const mandate = sampleModuleMandate();
  const funnel = sampleFunnel();
  const m = SAMPLE_METRICS;
  const sourced = funnel[0].count;

  return (
    <SampleModuleShell
      module="metrics"
      title="SEARCH_METRICS"
      meta={`Day ${mandate.dayOfSearch} of ${mandate.searchLengthDays} // stalling`}
    >
      <div className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Active pool" value={String(sourced)} accent="primary" />
        {/*
          No `unit` on any of the four. A unit renders under the value, which
          drops that tile's number a line below its neighbours' — four tiles
          in a row want one baseline.
        */}
        <KpiTile label="Weekly velocity" value={String(m.weeklyVelocity)} />
        <KpiTile label="Added this week" value={String(m.addedThisWeek)} />
        <KpiTile
          label="Avg score"
          value={String(m.averageScore)}
          accent="neutral"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border border-tertiary/50 bg-tertiary/[0.06] px-4 py-3">
        <StatusChip tone="tertiary" intensity="soft">
          Stalling
        </StatusChip>
        <p className="min-w-0 flex-1 basis-[260px] text-body-main text-on-surface">
          No pipeline movement for {m.daysSinceLastMovement} days. The slate is
          with the client and no panel date is booked.
        </p>
      </div>

      <Block heading="Funnel" meta={`${sourced} sourced // 0 offers`}>
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {funnel.map((f) => (
            <li key={f.stage} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-[112px] shrink-0 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                {f.stage}
              </span>
              <span
                aria-hidden
                className="h-2 min-w-0 flex-1 bg-outline-variant"
              >
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${sourced === 0 ? 0 : (f.count / sourced) * 100}%` }}
                />
              </span>
              <span className="w-[36px] shrink-0 text-right font-mono-data text-[13px] tabular-nums text-on-surface">
                {String(f.count).padStart(2, "0")}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        heading="Search health"
        meta={`${m.suggestions.length} suggestions // decision support`}
      >
        <ul className="space-y-2">
          {m.suggestions.map((s) => (
            <li
              key={s.id}
              className={`border px-4 py-3 ${SEVERITY_TONE[s.severity]}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip
                  tone={s.severity === "attention" ? "tertiary" : "neutral"}
                  intensity="soft"
                >
                  {s.severity === "attention" ? "Attention" : "Routine"}
                </StatusChip>
                <span className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface">
                  {s.title}
                </span>
              </div>
              <p className="mt-2 text-body-main leading-relaxed text-on-surface-variant">
                {s.body}
              </p>
            </li>
          ))}
        </ul>
      </Block>

      {/*
        Worth stating on the one screen where an agent is proposing actions:
        these are about the *search* — a boolean string, a stale slate, a
        re-score — and never about whether a person should be hired.
      */}
      <p className="font-mono-label text-[11px] uppercase leading-[1.6] tracking-[0.08em] text-outline">
        Search-health agent // suggestions about the search, never about a
        candidate // you decide
      </p>
    </SampleModuleShell>
  );
}

/* ── Hiring manager ──────────────────────────────────────────────── */

const RATING_TONE = {
  Advance: "primary",
  Hold: "tertiary",
} as const;

export function SampleHiringManager({ id }: { id: string }) {
  if (id !== SAMPLE_MANDATE_ID) {
    return <SampleModuleNotBuilt module="hiring-manager" mandateId={id} />;
  }

  const hm = SAMPLE_HM;

  return (
    <SampleModuleShell
      module="hiring-manager"
      title="HIRING_MANAGER_PORTAL"
      meta={`Link live // ${hm.token.opens} opens // expires in ${hm.token.expiresInDays} days`}
    >
      <Panel
        title="Share link"
        meta={<PanelMeta>Created {days(hm.token.createdDaysAgo)}</PanelMeta>}
      >
        <div className={`${PANEL_BODY} space-y-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="primary" intensity="soft">
              Active
            </StatusChip>
            <span className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface">
              {hm.token.label}
            </span>
          </div>
          {/*
            The label is derived from the chosen client contact rather than
            typed — the rule 054 introduced, so "who did we send this to" and
            "who signed it off" can be compared. Shown here because it is one
            of the less obvious things the product does.
          */}
          <p className="text-body-main leading-relaxed text-on-surface-variant">
            The link goes to a named contact on the client record, and the
            label is taken from that contact rather than typed, so the portal
            and the sign-off cannot disagree about who it went to. A hiring
            manager needs no account — the token is the whole authentication.
          </p>
          <p className="border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono-data text-xs text-outline">
            getmandate.io/hm/•••••••••••••••••••• (redacted in the sample)
          </p>
        </div>
      </Panel>

      <Block heading="What the client sees" meta={`${hm.slate.length} candidates`}>
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {hm.slate.map((c) => (
            <li key={c.candidateId} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-1 basis-[220px]">
                  <Link
                    href={`/app/projects/${SAMPLE_MANDATE_ID}/candidates/${c.candidateId}`}
                    prefetch={false}
                    className="text-body-main text-on-surface hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {c.name}
                  </Link>
                  <p className="mt-0.5 text-body-s text-on-surface-variant">
                    {c.headline}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusChip tone="neutral" intensity="soft">
                    Tier {c.tier}
                  </StatusChip>
                  <span className="font-mono-data text-[13px] tabular-nums text-on-surface">
                    {c.fit}
                  </span>
                </div>
              </div>
              {/* A score never travels without the fact that produced it. */}
              <p className="mt-1.5 font-mono-label text-[11px] uppercase leading-[1.5] tracking-[0.08em] text-outline">
                {c.evidence}
              </p>
            </li>
          ))}
        </ul>
      </Block>

      <Block heading="Reviews returned" meta={`${hm.reviews.length} of 2 reviewers`}>
        <ul className="space-y-2">
          {hm.reviews.map((r) => (
            <li
              key={r.id}
              className="border border-outline-variant bg-surface-container-low px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface">
                  {r.reviewer}
                </span>
                <span className="ml-auto font-mono-label text-[11px] uppercase tracking-[0.08em] tabular-nums text-outline">
                  {days(r.daysAgo)}
                </span>
              </div>

              <ul className="mt-2 flex flex-wrap gap-1.5">
                {r.ratings.map((rt) => (
                  <li key={rt.candidate}>
                    <StatusChip tone={RATING_TONE[rt.rating]} intensity="soft">
                      {rt.candidate} · {rt.rating}
                    </StatusChip>
                  </li>
                ))}
              </ul>

              <p className="mt-2.5 text-body-main leading-relaxed text-on-surface">
                {r.topConcern}
              </p>
            </li>
          ))}
        </ul>
      </Block>
    </SampleModuleShell>
  );
}

/* ── Feedback ────────────────────────────────────────────────────── */

function InterpretCard({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "primary" | "error" | "tertiary";
  items: readonly string[];
}) {
  const border =
    tone === "primary"
      ? "border-primary/40"
      : tone === "error"
        ? "border-error/40"
        : "border-tertiary/40";
  const text =
    tone === "primary"
      ? "text-primary"
      : tone === "error"
        ? "text-error"
        : "text-tertiary";

  return (
    <section className={`border ${border} bg-surface-container-low px-4 py-3`}>
      <h3
        className={`font-mono-label text-mono-label uppercase tracking-widest ${text}`}
      >
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
          None detected
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((t) => (
            <li key={t} className="text-body-main leading-relaxed text-on-surface">
              {t}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SampleFeedback({ id }: { id: string }) {
  if (id !== SAMPLE_MANDATE_ID) {
    return <SampleModuleNotBuilt module="feedback" mandateId={id} />;
  }

  const f = SAMPLE_FEEDBACK;

  return (
    <SampleModuleShell
      module="feedback"
      title="FEEDBACK"
      meta={`${f.entries.length} logged // 1 triggered a recalibration`}
    >
      <Block heading="Review logs" meta={`${f.entries.length} entries`}>
        <ul className="space-y-2">
          {f.entries.map((e) => (
            <li
              key={e.id}
              className="border border-outline-variant bg-surface-container-low px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <StatusChip tone="neutral" intensity="soft">
                  {e.source}
                </StatusChip>
                <span className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface">
                  {e.author}
                </span>
                {e.triggeredRecalibration && (
                  <StatusChip tone="primary" intensity="soft">
                    Recalibrated
                  </StatusChip>
                )}
                <span className="ml-auto font-mono-label text-[11px] uppercase tracking-[0.08em] tabular-nums text-outline">
                  {days(e.daysAgo)}
                </span>
              </div>
              <p className="mt-2 text-body-main leading-relaxed text-on-surface">
                {e.body}
              </p>
            </li>
          ))}
        </ul>
      </Block>

      <Block heading="What the feedback agent read into it" meta="Decision support">
        <div className="space-y-3">
          <Prose>{f.interpreted.summary}</Prose>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <InterpretCard
              tone="primary"
              title="Preference shifts"
              items={f.interpreted.preferenceChanges}
            />
            <InterpretCard
              tone="error"
              title="Bias patterns"
              items={f.interpreted.biasPatterns}
            />
            <InterpretCard
              tone="tertiary"
              title="Contradictions"
              items={f.interpreted.contradictions}
            />
          </div>

          <section className="border border-outline-variant bg-surface-container-low px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
                Suggested weight changes
              </h3>
              {f.interpreted.applied && (
                <StatusChip tone="primary" intensity="soft">
                  Applied as v03
                </StatusChip>
              )}
            </div>
            <ul className="mt-2 divide-y divide-outline-variant/40 border border-outline-variant">
              {f.interpreted.weightAdjustments.map((a) => (
                <li
                  key={a.dimension}
                  className="flex flex-wrap items-center gap-3 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 basis-[180px] truncate text-body-main text-on-surface">
                    {a.dimension}
                  </span>
                  <span className="font-mono-data text-[13px] tabular-nums text-outline">
                    {a.from} → <span className="text-primary">{a.to}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Block>

      {/*
        The bias block is the sharp edge on this screen. The fixture writes
        it as arithmetic — the stated reason against the record, both halves
        shown — so it is a pattern a person can check and disagree with. That
        is the line between decision support and a label about somebody.
      */}
      <p className="font-mono-label text-[11px] uppercase leading-[1.6] tracking-[0.08em] text-outline">
        Feedback agent // patterns across decisions, not judgements about
        people // a human applies or rejects every change
      </p>
    </SampleModuleShell>
  );
}

/* ── Weekly report ───────────────────────────────────────────────── */

export function SampleReports({ id }: { id: string }) {
  if (id !== SAMPLE_MANDATE_ID) {
    return <SampleModuleNotBuilt module="reports" mandateId={id} />;
  }

  const [latest, ...older] = SAMPLE_REPORTS;

  return (
    <SampleModuleShell
      module="reports"
      title="WEEKLY_PROGRESS_REPORT"
      meta={`Week ${latest.weekNumber} // generated ${days(latest.generatedDaysAgo)} // ${SAMPLE_REPORTS.length} in history`}
    >
      <article className="space-y-5 border border-outline-variant bg-surface-container-low px-5 py-5">
        <header className="space-y-1">
          <h2 className="font-h2 text-h2 uppercase tracking-tight text-on-surface">
            Week {latest.weekNumber}
          </h2>
          <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] tabular-nums text-outline">
            Generated {days(latest.generatedDaysAgo)} · for the client, edited
            before it is sent
          </p>
        </header>

        <ReportSection title="Executive summary">
          <p className="text-body-main leading-relaxed text-on-surface">
            {latest.executiveSummary}
          </p>
        </ReportSection>

        <ReportSection title={`Top ${latest.topCandidates.length} candidates`}>
          <ul className="divide-y divide-outline-variant/40 border border-outline-variant">
            {latest.topCandidates.map((c) => (
              <li key={c.name} className="px-3 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-body-main text-on-surface">{c.name}</span>
                  <span className="text-body-s text-on-surface-variant">
                    {c.headline}
                  </span>
                  <StatusChip tone="neutral" intensity="soft">
                    Tier {c.tier}
                  </StatusChip>
                </div>
                {/* Evidence, not a verdict — the rule from the candidate detail. */}
                <p className="mt-1 font-mono-label text-[11px] uppercase leading-[1.5] tracking-[0.08em] text-outline">
                  {c.evidence}
                </p>
              </li>
            ))}
          </ul>
        </ReportSection>

        <ReportSection title={`Sourced this week · ${latest.sourcedCount}`}>
          <p className="text-body-main text-on-surface-variant">
            {latest.sourcedNames.join(" · ")}
          </p>
        </ReportSection>

        <ReportSection title="Pipeline movement">
          <Bullets items={latest.pipelineMoves} />
        </ReportSection>

        <ReportSection title="Ranking changes">
          <Bullets items={latest.rankMoves} />
        </ReportSection>

        <ReportSection title="Feedback insights">
          <Bullets items={latest.feedbackInsights} />
        </ReportSection>

        <ReportSection title="Next steps">
          <Bullets items={latest.nextSteps} />
        </ReportSection>

        <ReportSection title="Market commentary">
          <p className="text-body-main leading-relaxed text-on-surface">
            {latest.marketCommentary}
          </p>
        </ReportSection>
      </article>

      <Block heading="History" meta={`${older.length} earlier reports`}>
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {older.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-3 px-4 py-3">
              <span className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface">
                Week {r.weekNumber}
              </span>
              <span className="min-w-0 flex-1 basis-[240px] truncate text-body-s text-on-surface-variant">
                {r.executiveSummary}
              </span>
              <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] tabular-nums text-outline">
                {days(r.generatedDaysAgo)}
              </span>
            </li>
          ))}
        </ul>
      </Block>
    </SampleModuleShell>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
        {title}
      </h3>
      {children}
    </section>
  );
}
