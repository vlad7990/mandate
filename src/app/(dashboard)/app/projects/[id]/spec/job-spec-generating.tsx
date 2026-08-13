"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SECTION_DEFS } from "@/lib/ai/job-spec-analysis";
import { markGenerationTimedOut } from "./actions";
import { IconArrowLeft } from "@/components/icons";

const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 60_000;

type Props = {
  projectId: string;
  roleTitle: string;
  companyName: string;
  /** Row id of the placeholder being polled — needed by the timeout marker. */
  specId: string;
  version: number;
};

/**
 * Polling skeleton shown while a placeholder row is `is_generating=true`.
 *
 * Failure handling is *not* duplicated here. router.refresh() re-runs the
 * spec/page.tsx server component on every tick; if that render finds
 * generation_error set on the current row, it routes to <JobSpecError />
 * instead of this component. React then unmounts <JobSpecGenerating />,
 * the useEffect cleanup below clears the polling interval, and the user
 * sees the retry CTA.
 *
 * After TIMEOUT_MS the client calls markGenerationTimedOut to write a
 * terminal failure to the row (only if it's still is_generating=true,
 * i.e. the AI call genuinely hasn't landed). The next router.refresh()
 * then routes through generation_error → <JobSpecError /> with retry CTA.
 * This unsticks the case where the after() callback was dropped, the
 * process was killed mid-generation, or the AI exceeded the window.
 */
export function JobSpecGenerating({
  projectId,
  roleTitle,
  companyName,
  specId,
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
        // Run-once guard: re-mounts (e.g. fast refresh) shouldn't fire the
        // timeout marker repeatedly.
        if (timedOutRef.current) return;
        timedOutRef.current = true;
        try {
          await markGenerationTimedOut(specId, projectId);
        } catch (err) {
          console.error("[spec/generating] timeout marker failed", err);
        }
        // Refresh in either case — even if the timeout marker failed we want
        // the user to see whatever the server now considers current state.
        router.refresh();
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router, specId, projectId]);

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-6xl mx-auto px-8 py-10 space-y-8">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/projects/${projectId}`}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{roleTitle}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Job Spec — Draft V{String(version).padStart(2, "0")}</span>
        </div>

        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-primary" />
            <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              Spec Generation Engine
            </span>
            <span className="ml-auto font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 bg-secondary-fixed-dim animate-pulse" />
              Live AI compilation
            </span>
          </div>
          <h1 className="font-h1 text-h1">Compiling job specification</h1>
          <p className="text-body-main text-on-surface-variant max-w-2xl">
            Drafting role overview, responsibilities, must-haves, leadership traits,
            and success metrics for{" "}
            <span className="text-on-surface">{roleTitle}</span> @{" "}
            <span className="text-on-surface">{companyName}</span>. This usually
            takes 5–10 seconds.
          </p>
        </header>

        <div className="space-y-4">
          {SECTION_DEFS.map((s, i) => (
            <div
              key={s.key}
              className="bg-surface-container-low border border-outline-variant p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
                  # {s.short}
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
      className="h-3 bg-surface-container-high animate-pulse"
      style={{ width: `${widthPct}%`, animationDelay: `${delay}ms` }}
    />
  );
}
