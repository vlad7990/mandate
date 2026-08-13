"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markInterviewPlanTimedOut } from "./actions";
import {
  IconArrowLeft,
} from "@/components/icons";

const POLL_INTERVAL_MS = 1500;
// Client-side unstick marker. Must exceed real generation latency — an 8000-token
// plan runs ~90–100s on production, so 90s produced a false "timed out" flash
// before the server after() callback finished. Kept comfortably above that.
const TIMEOUT_MS = 180_000;

type Props = {
  searchId: string;
  candidateId: string;
  candidateName: string;
  planId: string;
  version: number;
};

/** Polling skeleton while a placeholder is is_generating=true. Same contract
 * as the success-profile equivalent: refresh each tick; error/success routing
 * lives in page.tsx; timeout marker unsticks a dropped after() callback. */
export function PlanGenerating({
  searchId,
  candidateId,
  candidateName,
  planId,
  version,
}: Props) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);

  useEffect(() => {
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
    const id = setInterval(async () => {
      if (
        startedAtRef.current != null &&
        Date.now() - startedAtRef.current > TIMEOUT_MS
      ) {
        clearInterval(id);
        if (timedOutRef.current) return;
        timedOutRef.current = true;
        try {
          await markInterviewPlanTimedOut(planId, searchId, candidateId);
        } catch (err) {
          console.error("[interview-plan/generating] timeout marker failed", err);
        }
        router.refresh();
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router, planId, searchId, candidateId]);

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/executive-intelligence/searches/${searchId}/candidates`}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Candidates
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">
            {candidateName} — Interview Plan Draft V{String(version).padStart(2, "0")}
          </span>
        </div>

        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-primary" />
            <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              Interview Architect
            </span>
            <span className="ml-auto font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 bg-secondary-fixed-dim animate-pulse" />
              Drafting for human review
            </span>
          </div>
          <h1 className="font-h1 text-h1">Architecting the interview plan</h1>
          <p className="text-body-main text-on-surface-variant max-w-2xl">
            Turning the approved success profile and competency weights into
            concrete stages for{" "}
            <span className="text-on-surface">{candidateName}</span>. This usually
            takes up to two minutes.
          </p>
        </header>

        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface-container-low border border-outline-variant p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
                  # Stage {i + 1}
                </span>
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                  GENERATING…
                </span>
              </div>
              <div
                className="h-3 bg-surface-container-high animate-pulse"
                style={{ width: "88%", animationDelay: `${i * 80}ms` }}
              />
              <div
                className="h-3 bg-surface-container-high animate-pulse"
                style={{ width: "70%", animationDelay: `${i * 80 + 40}ms` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
