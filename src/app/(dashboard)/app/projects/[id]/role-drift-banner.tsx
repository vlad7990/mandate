"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconRefresh } from "@/components/icons";
import { rederiveCalibrationFromSpecAction } from "./actions";
import { unwrap } from "@/lib/actions/result";
import type { RoleDiff } from "@/lib/ai/rederive-role";

/**
 * §177 (F-A) — the role seam's drift, surfaced where the recruiter can
 * act on it.
 *
 * The door in spec-drift.ts refuses evaluation and ranking silently from
 * the recruiter's point of view — they click Upload and get a sentence.
 * This banner is what makes that sentence predictable: the mandate says,
 * before anything is attempted, that the role being scored is not the
 * role the finalised spec describes.
 *
 * The re-derivation is never automatic and never silent. The recruiter
 * asks, and the diff comes back so they can see what the role became.
 */
export function RoleDriftBanner({
  stale,
  projectId,
  specVersion,
  currentTitle,
}: {
  /** Server-computed drift. The component stays MOUNTED either way — see
   * the note at its call site — so that the receipt below survives the
   * re-render the remedy's revalidatePath triggers. */
  stale: boolean;
  projectId: string;
  specVersion: number | null;
  currentTitle: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [diff, setDiff] = useState<RoleDiff | null>(null);

  function recalibrate() {
    startTransition(async () => {
      try {
        const result = unwrap(
          await rederiveCalibrationFromSpecAction(projectId)
        );
        setDiff(result);
        toast.success(
          result.before.role_title && result.before.role_title !== result.after.role_title
            ? `Role re-derived: "${result.before.role_title}" → "${result.after.role_title}"`
            : "Role re-derived from the final job spec"
        );
        // NO router.refresh() here. Found by drive 118: refreshing
        // immediately re-renders the server component, which no longer
        // considers the mandate stale — so this banner unmounts and takes
        // the receipt with it. The recruiter saw a toast for four seconds
        // and nothing else. The refresh moves to the acknowledgement
        // below, so the diff survives until it has been read.
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not re-derive the role."
        );
      }
    });
  }

  // Once the diff is in hand the banner becomes the receipt for what
  // changed — the recruiter sees the two titles, not just a toast that
  // has already gone.
  if (diff) {
    return (
      <div className="border border-secondary-fixed-dim/40 bg-secondary-fixed-dim/5 p-4">
        <div className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest tabular-nums">
          Role re-derived from job spec v{diff.spec_version}
        </div>
        <dl className="mt-2 space-y-1 text-body-main">
          <div className="flex gap-2">
            <dt className="text-on-surface-variant shrink-0">Was</dt>
            <dd className="text-on-surface-variant line-through">
              {diff.before.role_title ?? "—"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-on-surface-variant shrink-0">Now</dt>
            <dd className="text-on-surface font-medium">
              {diff.after.role_title}
            </dd>
          </div>
        </dl>
        <p className="text-on-surface-variant text-body-main mt-2">
          {diff.change_summary}
        </p>
        <p className="text-on-surface-variant text-body-main mt-2">
          Scoring weights were not changed. If this role moved far enough
          that the weights no longer match it, adjust them in Optimise.
        </p>
        <button
          type="button"
          onClick={() => {
            setDiff(null);
            router.refresh();
          }}
          className="mt-3 border border-secondary-fixed-dim/60 px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-secondary-fixed-dim transition-colors hover:bg-secondary-fixed-dim/15"
        >
          Continue
        </button>
      </div>
    );
  }

  // Nothing to say: no drift, and no receipt outstanding.
  if (!stale && !diff) return null;

  return (
    <div className="border border-warn/60 bg-warn/10 p-4">
      <div className="flex items-start gap-3">
        <IconRefresh size={18} className="mt-0.5 shrink-0 text-warn" />
        <div className="flex-1 min-w-0">
          <div className="font-mono-label text-mono-label text-warn uppercase tracking-widest tabular-nums">
            Role does not match the final spec
          </div>
          <p className="text-on-surface text-body-main mt-1">
            This mandate scores candidates against{" "}
            <span className="font-medium">{currentTitle ?? "an earlier role"}</span>
            , derived before
            {specVersion != null ? ` job spec v${specVersion}` : " the final job spec"}{" "}
            was finalised. Evaluation and ranking are held until the role is
            re-derived, so no candidate is judged against the wrong mandate.
          </p>
          <button
            type="button"
            onClick={recalibrate}
            disabled={pending}
            className="mt-3 border border-warn/60 px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-warn transition-colors hover:bg-warn/15 disabled:opacity-50"
          >
            {pending ? "Re-deriving…" : "Recalibrate from final spec"}
          </button>
        </div>
      </div>
    </div>
  );
}
