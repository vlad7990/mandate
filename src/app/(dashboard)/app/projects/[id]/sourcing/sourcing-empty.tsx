"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { generateAllAction } from "./actions";
import {
  IconArrowLeft,
  IconGlobe,
  IconRefresh,
  IconSpark,
} from "@/components/icons";
import { unwrap } from "@/lib/actions/result";

type Props = {
  projectId: string;
  roleTitle: string;
  companyName: string;
  finalSpecVersion: number;
};

export function SourcingEmpty({
  projectId,
  roleTitle,
  companyName,
  finalSpecVersion,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleGenerate = () => {
    startTransition(async () => {
      try {
        unwrap(await generateAllAction(projectId));
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to generate.";
        console.error("[sourcing] generateAll failed:", e);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-10">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/projects/${projectId}`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{roleTitle}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Sourcing</span>
        </div>

        <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-primary-container/10 border border-primary-container/40 flex items-center justify-center">
            <IconGlobe size={28} className="text-primary" />
          </div>

          <div className="space-y-2 max-w-md">
            <h1 className="font-h1 text-h1">No sourcing queries yet</h1>
            <p className="text-body-main text-on-surface-variant">
              Synthesise four LinkedIn boolean variants, a Google X-Ray query,
              and an ATS search string from the finalised job spec for{" "}
              <span className="text-on-surface">{roleTitle}</span> @{" "}
              <span className="text-on-surface">{companyName}</span>. Each
              query is editable inline after generation.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            aria-busy={isPending ? true : undefined}
            className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <IconRefresh size={16} className="animate-spin" />
            ) : (
              <IconSpark size={16} />
            )}
            {isPending ? "Synthesising queries" : "Build Sourcing Queries"}
          </button>

          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            Anchored on FINAL_V{String(finalSpecVersion).padStart(2, "0")} ·
            Claude Sonnet 4.6 · usually under a minute
          </p>
        </div>
      </div>
    </div>
  );
}
