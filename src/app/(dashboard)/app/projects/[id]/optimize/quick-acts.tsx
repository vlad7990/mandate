"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { IconRefresh, IconSpark } from "@/components/icons";
import {
  PANEL_BODY,
  PANEL_BUTTON,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import { unwrap } from "@/lib/actions/result";
import { requestRegenerate } from "../spec/actions";
import { generateAllAction } from "../sourcing/actions";

/**
 * The acts that already exist, offered where they are lawful. Nothing
 * here is new machinery — each button is the same server action its
 * home surface calls, refusing with the same sentences.
 */
export function QuickActs({
  projectId,
  spec,
  queryCount,
}: {
  projectId: string;
  spec: { hasFinal: boolean; isGenerating: boolean };
  queryCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const regenerateSpec = () => {
    if (pending) return;
    start(async () => {
      try {
        const r = unwrap(await requestRegenerate(projectId));
        toast.success(
          r.wasExisting
            ? "A regeneration is already running — showing that one."
            : `Regenerating the spec as V${String(r.version).padStart(2, "0")}`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Regenerate failed.");
      }
    });
  };

  const generateQueries = () => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await generateAllAction(projectId));
        toast.success("Sourcing queries generated");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Generation failed.");
      }
    });
  };

  return (
    <Panel
      title="Quick acts"
      meta={<PanelMeta>Existing levers, one click</PanelMeta>}
    >
      <div className={PANEL_BODY}>
        <ul className="flex flex-col gap-2">
          <li className="flex flex-wrap items-center justify-between gap-3 border border-outline-variant bg-surface-container px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-on-surface">
                Redraft the job spec
              </p>
              <p className="text-[13px] leading-relaxed text-on-surface-variant">
                {spec.isGenerating
                  ? "A version is generating now — the spec editor is polling it."
                  : "A new version from the current calibration. Finalising stays yours."}
              </p>
            </div>
            <button
              type="button"
              onClick={regenerateSpec}
              disabled={pending || spec.isGenerating}
              className={PANEL_BUTTON}
            >
              {pending || spec.isGenerating ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : (
                <IconSpark size={14} />
              )}
              {spec.isGenerating ? "Regenerating" : "Regenerate"}
            </button>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 border border-outline-variant bg-surface-container px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-on-surface">
                Sourcing queries
              </p>
              <p className="text-[13px] leading-relaxed text-on-surface-variant">
                {queryCount === 0
                  ? "None exist yet — generate the full set from the final spec."
                  : `${queryCount} live — edit or regenerate slot by slot on the sourcing page.`}
              </p>
            </div>
            {queryCount === 0 ? (
              <button
                type="button"
                onClick={generateQueries}
                disabled={pending}
                className={PANEL_BUTTON}
              >
                {pending ? (
                  <IconRefresh size={14} className="animate-spin" />
                ) : (
                  <IconSpark size={14} />
                )}
                Generate all
              </button>
            ) : (
              <Link
                href={`/app/projects/${projectId}/sourcing`}
                prefetch={false}
                className={PANEL_BUTTON}
              >
                Open sourcing
              </Link>
            )}
          </li>
        </ul>
      </div>
    </Panel>
  );
}
