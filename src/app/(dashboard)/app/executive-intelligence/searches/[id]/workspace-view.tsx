import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { formatTimestampUtc } from "@/lib/executive/format";
import { DECISION_SUPPORT_DISCLAIMER } from "@/lib/executive/types";
import type { ExecutiveCompanyContext } from "@/lib/ai/executive-company-context-agent";
import {
  CompanyContextPoller,
  RegenerateContextButton,
} from "@/components/executive/company-context-controls";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";

/**
 * The Executive Intelligence workspace — comp 11, on real data.
 *
 * Presentation only: `page.tsx` does every query and hands over a finished
 * view model. The split is what makes the screen verifiable — it can be
 * rendered from fixtures in a browser without a session, which is otherwise
 * impossible for an authenticated page.
 *
 * The sample at `src/components/sample/sample-ei-workspace.tsx` is the target
 * design and its three rules carry over unchanged:
 *
 * - **Approved looks deliberate.** An approved success profile renders as a
 *   record — the mission, the weights it wrote, and a provenance footer
 *   naming who approved it, when, and which version it supersedes — not as a
 *   greyed-out form.
 * - **Gates are signposts.** Every step in the chain states its own
 *   precondition, so nobody discovers a database constraint by clicking into
 *   a dead end.
 * - **Editorial, not terminal.** EI artifacts get a wider measure and more
 *   generous leading than the rest of the app.
 *
 * Two deliberate departures from the comp, both because the comp outruns the
 * product:
 *
 * - The comp's fifth panel, "Risk review", describes a capability that does
 *   not exist. A dashed placeholder for it would be a roadmap promise
 *   rendered as a feature, so it is not here.
 * - The comp's chain counts are fixtures. Every count here is computed from
 *   the linked candidates and their plan and assessment rows, and reads "not
 *   started" rather than inventing a state.
 */

export type ChainStep = {
  label: string;
  badge: string;
  detail: string;
  /**
   * `active` is the one step that wants attention now, and exactly one step
   * carries it — three accent borders at once point nowhere. `todo` is open
   * but not next, `locked` has an unmet precondition and is drawn back.
   */
  state: "locked" | "active" | "todo" | "done";
  href?: string;
};

export type WeightBar = { key: string; name: string; share: number };

export type ProfilePanel =
  | {
      kind: "approved";
      mission: string;
      weights: WeightBar[];
      approvedAt: string | null;
      approverName: string | null;
      version: number;
      supersedes: number | null;
      promptVersion: string | null;
    }
  | {
      kind: "pending";
      chip: string;
      body: string;
      error: string | null;
    };

export type CandidateRow = {
  id: string;
  name: string;
  subtitle: string;
  initials: string;
  stageLabel: string;
  note: string;
  href: string;
  /** On hold or declined — present, but not part of the live funnel. */
  muted: boolean;
};

export type WorkspaceVm = {
  searchId: string;
  roleTitle: string;
  companyName: string;
  statusLabel: string;
  tierLabel: string;
  /** Company facts for the header line — only the ones on record. */
  facts: string[];
  chain: ChainStep[];
  profile: ProfilePanel;
  profileHref: string;
  profileLinkLabel: string;
  candidates: CandidateRow[];
  candidatesHref: string;
  contextStatus: "none" | "generating" | "ready" | "failed";
  contextError: string | null;
  context: ExecutiveCompanyContext | null;
  intake: { k: string; v: string }[];
  audit: { id: string; date: string; eventType: string }[];
};

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-outline-variant px-5 py-4">
        <h2 className="font-heading text-[15px] font-semibold text-on-surface">
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  );
}

function Chip({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "accent" | "muted";
}) {
  return (
    <span
      className={`rounded-md border border-outline-variant bg-surface-container px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] ${
        tone === "accent" ? "text-primary" : "text-on-surface-variant"
      }`}
    >
      {children}
    </span>
  );
}

export function ExecutiveSearchWorkspace({ vm }: { vm: WorkspaceVm }) {
  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      {vm.contextStatus === "generating" && <CompanyContextPoller />}

      <SetBreadcrumbs
        crumbs={[
          { label: "Executive Intelligence", href: "/app/executive-intelligence" },
          { label: `${vm.roleTitle} · ${vm.companyName}` },
        ]}
      />

      <header className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-heading text-[30px] font-semibold leading-tight tracking-tight text-on-surface">
            {vm.roleTitle}
          </h1>
          <Chip tone="accent">{vm.statusLabel}</Chip>
          <Chip>{vm.tierLabel}</Chip>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-outline">
          <span className="text-on-surface-variant">{vm.companyName}</span>
          {vm.facts.map((f) => (
            <span key={f} className="flex items-center gap-3">
              <span aria-hidden className="text-outline-variant">
                /
              </span>
              {f}
            </span>
          ))}
        </p>
      </header>

      {/* The chain, drawn as a path rather than discovered by hitting walls. */}
      <section className="mt-5 rounded-xl border border-outline-variant bg-surface-container-low p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-sm font-semibold text-on-surface">Diligence chain</h2>
          <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
            Each step unlocks the next · approval is irreversible in place
          </span>
        </div>

        <ol className="mt-4 flex flex-col gap-2 xl:flex-row xl:items-stretch xl:gap-0">
          {vm.chain.map((s, i) => {
            const card = (
              <div
                className={`flex h-full min-w-0 flex-1 flex-col gap-2 rounded-[10px] border p-3.5 ${
                  s.state === "active"
                    ? "border-primary bg-surface-container"
                    : s.state === "locked"
                      ? "border-outline-variant bg-surface-container-low"
                      : "border-outline-variant bg-surface-container"
                } ${s.href ? "transition-colors hover:border-primary/70" : ""}`}
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
                <span className="text-xs leading-relaxed text-outline">{s.detail}</span>
              </div>
            );

            return (
              <li key={s.label} className="flex min-w-0 flex-1 items-stretch">
                {s.href ? (
                  <Link href={s.href} className="flex min-w-0 flex-1">
                    {card}
                  </Link>
                ) : (
                  card
                )}

                {i < vm.chain.length - 1 && (
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
                {vm.profile.kind === "approved" ? (
                  <span className="rounded-md bg-primary/20 px-2 py-1 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                    Approved · read-only
                  </span>
                ) : (
                  <Chip>{vm.profile.chip}</Chip>
                )}
                <Link
                  href={vm.profileHref}
                  className="ml-auto font-mono-label text-[11px] font-semibold uppercase tracking-[0.08em] text-primary hover:underline"
                >
                  {vm.profileLinkLabel}
                </Link>
              </>
            }
          >
            {vm.profile.kind === "approved" ? (
              <div className="flex flex-col gap-[18px] px-5 py-5">
                {/* Editorial register: wider measure, generous leading. */}
                {vm.profile.mission && (
                  <p className="max-w-[70ch] text-[17px] leading-[1.7] text-on-surface">
                    {vm.profile.mission}
                  </p>
                )}

                {vm.profile.weights.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                      Operational competency weights
                    </p>
                    <div className="grid gap-x-7 gap-y-2.5 sm:grid-cols-2">
                      {(() => {
                        // Bars are scaled to the heaviest competency, not to
                        // 100%. Six weights summing to 100 never exceed a
                        // quarter of the track each, and the row then reads as
                        // an underline rather than a comparison. Relative
                        // lengths are unchanged — every bar is multiplied by
                        // the same factor — and the true share is printed
                        // beside it.
                        const max = Math.max(...vm.profile.weights.map((w) => w.share), 1);
                        return vm.profile.weights.map((w) => (
                          <div key={w.key}>
                            <div className="flex justify-between gap-3 text-[13px] font-medium leading-[1.7] text-on-surface-variant">
                              <span className="min-w-0">{w.name}</span>
                              <span className="font-mono-data shrink-0">{w.share}%</span>
                            </div>
                            <span
                              aria-hidden
                              className="block h-1 rounded-sm bg-surface-container-high"
                            >
                              <span
                                className="block h-full rounded-sm bg-primary"
                                style={{ width: `${Math.round((w.share / max) * 100)}%` }}
                              />
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {/*
                  Provenance, not a disabled form. This is what makes an
                  approved artifact read as a record: who, when, which version
                  it supersedes, and which prompt drafted it — the same facts
                  the audit trail holds.
                */}
                <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-outline-variant/60 pt-4 font-mono-label text-[11px] uppercase leading-relaxed text-outline">
                  <span>Approved {formatTimestampUtc(vm.profile.approvedAt)}</span>
                  <span>By {vm.profile.approverName ?? "approver not recorded"}</span>
                  <span>
                    Version {vm.profile.version}
                    {vm.profile.supersedes !== null
                      ? ` · supersedes v${vm.profile.supersedes}`
                      : ""}
                  </span>
                  {vm.profile.promptVersion && <span>Prompt {vm.profile.promptVersion}</span>}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 px-5 py-5">
                <p className="max-w-[70ch] text-[15px] leading-relaxed text-on-surface-variant">
                  {vm.profile.body}
                </p>
                {vm.profile.error && (
                  <p className="font-mono-label text-[11px] leading-relaxed text-error">
                    {vm.profile.error}
                  </p>
                )}
              </div>
            )}
          </Panel>

          <Panel
            title="Candidates in diligence"
            meta={
              <>
                <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                  {vm.candidates.length > 0
                    ? `${vm.candidates.length} linked from the organisation pool`
                    : "None linked yet"}
                </span>
                <Link
                  href={vm.candidatesHref}
                  className="ml-auto font-mono-label text-[11px] font-semibold uppercase tracking-[0.08em] text-primary hover:underline"
                >
                  {vm.candidates.length > 0 ? "Manage" : "Link candidates"}
                </Link>
              </>
            }
          >
            {vm.candidates.length === 0 ? (
              <p className="px-5 py-5 text-[15px] leading-relaxed text-on-surface-variant">
                No candidates are linked to this search. Attach them from your
                organisation&rsquo;s pool — each one gets its own interview plan
                and assessment, and the chain above tracks them individually.
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant/40">
                {vm.candidates.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={c.href}
                      className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-container"
                    >
                      <span
                        aria-hidden
                        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-outline-variant bg-surface-container-high font-mono-label text-[11px] font-semibold text-on-surface-variant"
                      >
                        {c.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm font-medium ${
                            c.muted ? "text-outline" : "text-on-surface"
                          }`}
                        >
                          {c.name}
                        </span>
                        <span className="block truncate text-xs text-outline">
                          {c.subtitle}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-md bg-surface-container-high px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
                        {c.stageLabel}
                      </span>
                      <span className="w-full text-xs leading-relaxed text-outline sm:w-[200px]">
                        {c.note}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel
            title="Company operating context"
            meta={
              vm.contextStatus === "failed" ? (
                <span className="ml-auto">
                  <RegenerateContextButton searchId={vm.searchId} />
                </span>
              ) : vm.contextStatus === "none" ? (
                <span className="ml-auto">
                  <RegenerateContextButton searchId={vm.searchId} label="Run Research" />
                </span>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-4 px-5 py-4">
              {vm.contextStatus === "generating" && (
                <>
                  <p className="flex items-center gap-2 text-[13px] leading-relaxed text-on-surface-variant">
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
                    Researching {vm.companyName} — this panel updates
                    automatically.
                  </p>
                  <div className="h-3 w-11/12 animate-pulse rounded-sm bg-surface-container-high" />
                  <div className="h-3 w-4/5 animate-pulse rounded-sm bg-surface-container-high" />
                  <div className="h-3 w-3/5 animate-pulse rounded-sm bg-surface-container-high" />
                </>
              )}

              {vm.contextStatus === "failed" && (
                <p className="text-[13px] leading-relaxed text-on-surface-variant">
                  <span className="mr-2 font-mono-label text-[11px] uppercase tracking-[0.08em] text-error">
                    Research failed
                  </span>
                  {vm.contextError ?? "Unknown error."}
                </p>
              )}

              {vm.contextStatus === "none" && (
                <p className="text-[13px] leading-relaxed text-on-surface-variant">
                  Research has not been run. It grounds the success profile in
                  how this company actually operates — stage, scale, and
                  regulatory environment.
                </p>
              )}

              {vm.context && (
                <>
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-on-surface-variant">
                    {vm.context.operating_summary}
                  </p>
                  {vm.context.operating_challenges?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {vm.context.operating_challenges.map((c) => (
                        <span
                          key={c}
                          className="rounded-md border border-outline-variant px-2 py-1 font-mono-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  {vm.context.stage_and_scale_demands && (
                    <div>
                      <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                        Stage &amp; scale demands
                      </p>
                      <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-on-surface-variant">
                        {vm.context.stage_and_scale_demands}
                      </p>
                    </div>
                  )}
                  {vm.context.regulatory_and_governance && (
                    <div>
                      <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                        Regulatory &amp; governance
                      </p>
                      <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-on-surface-variant">
                        {vm.context.regulatory_and_governance}
                      </p>
                    </div>
                  )}
                  <p className="border-t border-outline-variant/60 pt-3.5 text-[11px] leading-relaxed text-outline">
                    {vm.context.sources?.length ?? 0} sources · generated{" "}
                    {formatTimestampUtc(vm.context.generated_at)}.{" "}
                    {DECISION_SUPPORT_DISCLAIMER}
                  </p>
                </>
              )}
            </div>
          </Panel>

          {vm.intake.length > 0 && (
            <Panel title="Intake brief">
              <div className="flex flex-col gap-3.5 px-5 py-4">
                {vm.intake.map((r) => (
                  <div key={r.k}>
                    <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                      {r.k}
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-on-surface-variant">
                      {r.v}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel
            title="Audit trail"
            meta={
              <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                Append-only
              </span>
            }
          >
            {vm.audit.length === 0 ? (
              <p className="px-5 py-4 text-[13px] leading-relaxed text-outline">
                No events recorded yet.
              </p>
            ) : (
              <ul className="py-1.5">
                {vm.audit.map((e) => (
                  <li key={e.id} className="flex gap-3 px-5 py-2.5">
                    <span className="w-[92px] shrink-0 font-mono-label text-[11px] leading-relaxed text-outline">
                      {e.date}
                    </span>
                    {/* The raw event type is the record. Prettifying it would
                        make the trail read as prose and stop matching what the
                        audit table actually holds. */}
                    <span className="min-w-0 break-words font-mono-label text-xs leading-relaxed text-on-surface-variant">
                      {e.eventType}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
