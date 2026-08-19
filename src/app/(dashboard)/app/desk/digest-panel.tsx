"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { generateDeskDigestAction } from "./actions";
import type { DeskDigest } from "@/lib/ai/desk-digest-agent";

/**
 * The desk digest — rendered here and nowhere else, and the panel says so:
 * there is no email channel until Resend exists, and a digest that
 * pretended to have been sent would be §14's "motion, not automation".
 */
export function DigestPanel({
  latest,
}: {
  latest: { content_json: DeskDigest; created_at: string } | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    startTransition(async () => {
      try {
        unwrap(await generateDeskDigestAction());
        toast.success("Desk digest generated.");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "The desk digest could not run.";
        console.error("[desk] digest failed:", err);
        toast.error(msg);
      }
    });
  };

  const digest = latest?.content_json ?? null;

  return (
    <section aria-label="Desk digest" className="border border-outline-variant">
      <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low flex flex-wrap items-center gap-3">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant flex-1">
          Desk digest
          {latest && (
            <span className="ml-2 normal-case tracking-normal text-outline">
              {new Date(latest.created_at).toISOString().slice(0, 10)}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={generate}
          disabled={isPending}
          className="px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-primary border border-primary-container hover:bg-primary-container/10 transition-colors disabled:opacity-60"
        >
          {isPending ? "Synthesising…" : digest ? "Regenerate" : "Generate digest"}
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {!digest && (
          <p className="text-body-main text-on-surface-variant">
            One Claude call across the whole desk — where the load sits, what
            moved, what stalled, and what to do about it. Grounded only in the
            rollup above; the agent is forbidden from citing anything it
            cannot see.
          </p>
        )}

        {digest && (
          <>
            <p className="text-on-surface font-medium">{digest.headline}</p>
            <p className="text-body-main text-on-surface-variant whitespace-pre-line">
              {digest.desk_reading}
            </p>
            {digest.member_notes.length > 0 && (
              <dl className="space-y-2">
                {digest.member_notes.map((n) => (
                  <div key={n.member} className="flex gap-3">
                    <dt className="font-mono-label text-mono-label uppercase tracking-widest text-outline shrink-0 pt-0.5">
                      {n.member}
                    </dt>
                    <dd className="text-body-main text-on-surface-variant">{n.note}</dd>
                  </div>
                ))}
              </dl>
            )}
            {digest.risks.length > 0 && (
              <div>
                <h3 className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary mb-1">
                  Risks
                </h3>
                <ul className="list-disc pl-5 text-body-main text-on-surface-variant space-y-1">
                  {digest.risks.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {digest.next_actions.length > 0 && (
              <div>
                <h3 className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant mb-1">
                  Next actions
                </h3>
                <ul className="list-disc pl-5 text-body-main text-on-surface-variant space-y-1">
                  {digest.next_actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Renders here only — no email channel until Resend is wired. AI-generated
          decision support; it informs judgment and decides nothing.
        </p>
      </div>
    </section>
  );
}
