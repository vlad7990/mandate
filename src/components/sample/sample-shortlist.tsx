import Link from "next/link";
import { IconInfo } from "@/components/icons";
import {
  SampleModuleNotBuilt,
  SampleModuleShell,
} from "@/components/sample/sample-mandate-shell";
import {
  SAMPLE_COMPARISON,
  SAMPLE_MANDATE_ID,
  SAMPLE_SHORTLIST,
  sampleCandidate,
  sampleModuleMandate,
  sampleRanking,
} from "@/lib/sample";

/**
 * The submitted shortlist.
 *
 * ## Why this screen is a record and not a builder
 *
 * The product's `/shortlist` is `ShortlistBuilder` — pool on one side,
 * slate on the other, compose, generate, submit. Almost every control on
 * it is a write, and the sample ships no control it cannot honour
 * (`5107767`, and every workstream since).
 *
 * Disabling the controls would have been the worst option available,
 * because on this screen the controls *are* the screen. So the sample
 * shows the state Larkspur is actually in: `SAMPLE_MANDATES` puts it at
 * **WITH CLIENT**, which means the slate has already gone. A submitted
 * shortlist is read-only in the real product too — it is the record of
 * what was sent and when — so nothing here is a sample limitation
 * pretending to be a design.
 *
 * ## Everything countable comes from somewhere else
 *
 * The two names are `SAMPLE_COMPARISON.primarySlate`, so this screen and
 * `/comparison` cannot name different people. Ranks and scores come from
 * `sampleRanking()`, the same function the leaderboard uses. The backup
 * set is named rather than hidden, because "who was held back" is half of
 * what a submission record is for.
 */
export function SampleShortlist({ id }: { id: string }) {
  // Only Larkspur has module screens behind it. The other six sample
  // mandates get the honest not-built state rather than Larkspur's slate
  // rendered under a Cindermere URL.
  if (id !== SAMPLE_MANDATE_ID) {
    return <SampleModuleNotBuilt module="shortlist" mandateId={id} />;
  }

  const mandate = sampleModuleMandate();
  const ranking = sampleRanking(SAMPLE_MANDATE_ID);
  const rankOf = (cid: string) => ranking.find((r) => r.candidate.id === cid);

  const backups = SAMPLE_COMPARISON.backupSlate
    .map((cid) => ({ id: cid, entry: rankOf(cid), candidate: sampleCandidate(cid) }))
    .filter((b) => b.candidate);

  return (
    <SampleModuleShell
      module="shortlist"
      title="SHORTLIST"
      meta={[
        `${SAMPLE_SHORTLIST.slateSize} submitted`,
        `${backups.length} held in reserve`,
        `sent day ${mandate.dayOfSearch - SAMPLE_SHORTLIST.submittedDaysAgo}`,
      ].join(" // ")}
    >
      <div className="flex flex-col gap-5">
        {/* The state, stated first. Everything below reads differently if
            you do not know the slate has already gone. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-outline-variant bg-surface-container-low px-5 py-4">
          <span className="bg-primary/20 px-2.5 py-1.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
            Submitted
          </span>
          <span className="min-w-0 text-body-main text-on-surface-variant">
            Sent to {SAMPLE_SHORTLIST.submittedTo} —{" "}
            <span className="text-outline">{SAMPLE_SHORTLIST.submittedToRole}</span>
          </span>
          <span className="ml-auto font-mono-label text-[11px] uppercase tracking-wider tabular-nums text-outline">
            Day {mandate.dayOfSearch - SAMPLE_SHORTLIST.submittedDaysAgo}
          </span>
        </div>

        <section className="border border-outline-variant bg-surface-container-low">
          <div className="border-b border-outline-variant px-5 py-4">
            <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
              Submission report
            </h2>
          </div>
          <div className="flex flex-col gap-4 px-5 py-5">
            <p className="max-w-[70ch] text-[16px] leading-[1.75] text-on-surface">
              {SAMPLE_SHORTLIST.executiveSummary}
            </p>
            <div>
              <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                Why this slate
              </p>
              <p className="mt-2 max-w-[70ch] text-[15px] leading-[1.7] text-on-surface-variant">
                {SAMPLE_SHORTLIST.slateRationale}
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
            The slate
          </h2>
          {SAMPLE_SHORTLIST.briefs.map((b, i) => {
            const entry = rankOf(b.candidateId);
            const candidate = sampleCandidate(b.candidateId);
            if (!candidate) return null;
            return (
              <article
                key={b.candidateId}
                className="border border-outline-variant bg-surface-container-low"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-outline-variant px-5 py-4">
                  <span
                    aria-hidden
                    className="font-mono-data text-[11px] tabular-nums text-outline"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="min-w-0 flex-1 basis-[200px] text-[15px] font-semibold text-on-surface">
                    {candidate.name}
                  </p>
                  {/* A score never travels without its rank and tier. */}
                  {entry && (
                    <span className="shrink-0 font-mono-data text-xs tabular-nums text-on-surface-variant">
                      {entry.overall.toFixed(2)} · rank {entry.rank} · tier{" "}
                      {entry.tier}
                    </span>
                  )}
                  <span className="shrink-0 border border-outline-variant px-2 py-1 font-mono-label text-[10px] uppercase tracking-[0.1em] text-on-surface-variant">
                    {b.recommendation}
                  </span>
                </div>

                <div className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2">
                  <div>
                    <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                      Strengths
                    </p>
                    <ul className="mt-2 flex flex-col gap-2">
                      {b.strengths.map((s) => (
                        <li
                          key={s}
                          className="flex gap-2.5 text-[13px] leading-relaxed text-on-surface-variant"
                        >
                          <span aria-hidden className="shrink-0 text-outline-variant">
                            —
                          </span>
                          <span className="min-w-0">{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                      Risks flagged to the client
                    </p>
                    <ul className="mt-2 flex flex-col gap-2">
                      {b.risks.map((r) => (
                        <li
                          key={r}
                          className="flex gap-2.5 text-[13px] leading-relaxed text-on-surface-variant"
                        >
                          <span aria-hidden className="shrink-0 text-outline-variant">
                            —
                          </span>
                          <span className="min-w-0">{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="border-t border-outline-variant/60 px-5 py-3.5 text-[13px] leading-relaxed text-outline">
                  <span className="uppercase">Trade-off</span> — {b.tradeoff}
                </p>
              </article>
            );
          })}
        </section>

        <section className="border border-outline-variant bg-surface-container-low">
          <div className="border-b border-outline-variant px-5 py-4">
            <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
              If you pick
            </h2>
          </div>
          <ul className="divide-y divide-outline-variant/40">
            {SAMPLE_SHORTLIST.scenarios.map((s) => (
              <li key={s.headline} className="flex flex-col gap-1.5 px-5 py-4">
                <p className="text-[14px] font-semibold text-on-surface">
                  {s.headline}
                </p>
                <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
                  {s.detail}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex items-start gap-3 border-t border-outline-variant/60 px-5 py-4">
            <IconInfo size={15} className="mt-0.5 shrink-0 text-outline" />
            <p className="text-[13px] leading-relaxed text-on-surface-variant">
              <span className="font-mono-label uppercase tracking-wider text-outline">
                Next step
              </span>{" "}
              — {SAMPLE_SHORTLIST.nextStep}
            </p>
          </div>
        </section>

        {/* Who was held back is half of what a submission record is for. */}
        <section className="border border-dashed border-outline-variant bg-surface-container-low">
          <div className="border-b border-outline-variant px-5 py-4">
            <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Held in reserve — not sent
            </h2>
          </div>
          <ul className="divide-y divide-outline-variant/40">
            {backups.map(({ id, entry, candidate }) => (
              <li
                key={id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5"
              >
                <span className="min-w-0 flex-1 basis-[180px] text-[14px] text-on-surface-variant">
                  {candidate?.name}
                </span>
                {entry && (
                  <span className="shrink-0 font-mono-data text-xs tabular-nums text-outline">
                    {entry.overall.toFixed(2)} · tier {entry.tier}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-outline-variant/60 px-5 py-3.5 text-xs leading-relaxed text-outline">
            Ranked and reviewed, and deliberately not submitted. Putting a
            Tier 2 beside a Tier 1 invites a client to reject the slate rather
            than choose within it.
          </p>
        </section>

        <p className="text-[11px] leading-relaxed text-outline">
          This slate has already been submitted, so there is nothing here to
          compose or send.{" "}
          <Link
            href={`/app/projects/${SAMPLE_MANDATE_ID}/comparison`}
            prefetch={false}
            className="text-primary hover:underline"
          >
            See the full comparison it came from
          </Link>
          .
        </p>
      </div>
    </SampleModuleShell>
  );
}
