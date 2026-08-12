"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  PROFILE_LIST_SECTIONS,
  PROFILE_TEXT_SECTIONS,
} from "@/lib/ai/executive-role-architect-agent";
import { markProfileGenerationTimedOut } from "./actions";
import { IconArrowLeft } from "@/components/icons";

const POLL_INTERVAL_MS = 1500;
// Client-side unstick marker. Must exceed real generation latency — profile
// generation runs ~80s on production, close enough to the old 90s that a slow
// run could false-trip. Kept comfortably above the server-side budget.
const TIMEOUT_MS = 180_000;

type Props = {
  searchId: string;
  roleTitle: string;
  companyName: string;
  profileId: string;
  version: number;
};

/**
 * Polling skeleton while a placeholder row is is_generating=true. Same
 * contract as the job-spec equivalent: router.refresh() re-runs the server
 * component each tick; error/success routing lives in page.tsx. After
 * TIMEOUT_MS the timeout marker writes a terminal failure (only if the row
 * is still generating) so a dropped after() callback can't strand the UI.
 */
export function ProfileGenerating({
  searchId,
  roleTitle,
  companyName,
  profileId,
  version,
}: Props) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);

  useEffect(() => {
    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
    }
    const id = setInterval(async () => {
      if (
        startedAtRef.current != null &&
        Date.now() - startedAtRef.current > TIMEOUT_MS
      ) {
        clearInterval(id);
        if (timedOutRef.current) return;
        timedOutRef.current = true;
        try {
          await markProfileGenerationTimedOut(profileId, searchId);
        } catch (err) {
          console.error("[success-profile/generating] timeout marker failed", err);
        }
        router.refresh();
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router, profileId, searchId]);

  const skeletonSections = [
    ...PROFILE_TEXT_SECTIONS.slice(0, 2),
    ...PROFILE_LIST_SECTIONS.slice(0, 4),
  ];

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/executive-intelligence/searches/${searchId}`}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Search Workspace
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">
            Success Profile — Draft V{String(version).padStart(2, "0")}
          </span>
        </div>

        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-primary" />
            <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              Executive Role Architect
            </span>
            <span className="ml-auto font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary-fixed-dim animate-pulse" />
              Drafting for human review
            </span>
          </div>
          <h1 className="font-h1 text-h1">Architecting the Success Profile</h1>
          <p className="text-body-main text-on-surface-variant max-w-2xl">
            Synthesising the intake brief, company research, and competency library
            into a due-diligence profile for{" "}
            <span className="text-on-surface">{roleTitle}</span> @{" "}
            <span className="text-on-surface">{companyName}</span>. This usually
            takes up to two minutes.
          </p>
        </header>

        <div className="space-y-4">
          {skeletonSections.map((s, i) => (
            <div
              key={s.key}
              className="bg-surface-container-low border border-outline-variant p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
                  # {s.label}
                </span>
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                  GENERATING…
                </span>
              </div>
              <SkeletonRow widthPct={92} delay={i * 80} />
              <SkeletonRow widthPct={78} delay={i * 80 + 40} />
              <SkeletonRow widthPct={64} delay={i * 80 + 80} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonRow({ widthPct, delay }: { widthPct: number; delay: number }) {
  return (
    <div
      className="h-3 bg-surface-container-high rounded-sm animate-pulse"
      style={{ width: `${widthPct}%`, animationDelay: `${delay}ms` }}
    />
  );
}
