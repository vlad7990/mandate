"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PIPELINE_LABELS,
  PIPELINE_STAGES,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { updatePipelineStage } from "../candidates/actions";
import { unwrap } from "@/lib/actions/result";
import { cn } from "@/lib/utils";
import { IconGroup, IconRefresh, IconUpload } from "@/components/icons";
import { STAGE_ACCENTS } from "./stage-accents";

export type BoardCandidate = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  pipeline_stage: string | null;
  cv_processing: boolean;
  cv_parse_error: string | null;
  updated_at: string;
};

type DragState = {
  id: string;
  name: string;
  from: PipelineStage;
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  started: boolean;
};

function stageOf(c: BoardCandidate): PipelineStage {
  return (c.pipeline_stage ?? "found") as PipelineStage;
}

export function PipelineBoard({
  projectId,
  candidates,
  canWrite,
}: {
  projectId: string;
  candidates: BoardCandidate[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Optimistic stage per candidate. The card moves the moment it is
  // dropped; the entry is cleared once the server render agrees, or on
  // failure, when the card falls back to what the server still says.
  const [overlay, setOverlay] = useState<Record<string, PipelineStage>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const dropRef = useRef<PipelineStage | null>(null);
  const suppressClickRef = useRef(false);
  const [dragView, setDragView] = useState<DragState | null>(null);
  const [dropStage, setDropStage] = useState<PipelineStage | null>(null);

  // Adjust-during-render (not an effect): once the server render agrees
  // with an optimistic entry, the entry has done its job and is dropped,
  // so a later change made elsewhere — the detail page's select, another
  // tab — is never masked by a stale overlay.
  const [prevCandidates, setPrevCandidates] = useState(candidates);
  if (candidates !== prevCandidates) {
    setPrevCandidates(candidates);
    let changed = false;
    const next = { ...overlay };
    for (const c of candidates) {
      if (next[c.id] && c.pipeline_stage === next[c.id]) {
        delete next[c.id];
        changed = true;
      }
    }
    if (changed) setOverlay(next);
  }

  const commit = (id: string, name: string, to: PipelineStage) => {
    setOverlay((prev) => ({ ...prev, [id]: to }));
    setPendingId(id);
    startTransition(async () => {
      try {
        unwrap(await updatePipelineStage(id, projectId, to));
        toast.success(`${name} → ${PIPELINE_LABELS[to]}`);
        router.refresh();
      } catch (err) {
        // Put the card back where the server still has it.
        setOverlay((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        const msg = err instanceof Error ? err.message : "Update failed.";
        console.error("[pipeline] stage update failed:", err);
        toast.error(msg);
      } finally {
        setPendingId(null);
      }
    });
  };

  const handleCardPointerDown = (
    e: React.PointerEvent<HTMLElement>,
    c: BoardCandidate
  ) => {
    // Mouse only: a touch that started a drag could no longer scroll the
    // board, and the per-card stage select is the touch path anyway.
    if (!canWrite || e.button !== 0 || e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const state: DragState = {
      id: c.id,
      name: c.full_name,
      from: overlay[c.id] ?? stageOf(c),
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      started: false,
    };
    dragRef.current = state;
    dropRef.current = null;

    const onMove = (ev: PointerEvent) => {
      const s = dragRef.current;
      if (!s) return;
      s.x = ev.clientX;
      s.y = ev.clientY;
      if (
        !s.started &&
        Math.hypot(ev.clientX - s.startX, ev.clientY - s.startY) > 6
      ) {
        s.started = true;
        suppressClickRef.current = true;
      }
      if (!s.started) return;
      ev.preventDefault();
      const col = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest("[data-stage]");
      const stage = (col?.getAttribute("data-stage") ??
        null) as PipelineStage | null;
      dropRef.current = stage;
      setDropStage(stage);
      setDragView({ ...s });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const s = dragRef.current;
      const target = dropRef.current;
      dragRef.current = null;
      dropRef.current = null;
      setDragView(null);
      setDropStage(null);
      if (s?.started && target && target !== s.from) {
        commit(s.id, s.name, target);
      }
      // The click the browser synthesises from this pointerup fires before
      // the timeout, so a completed drag never also navigates.
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center space-y-6 border border-outline-variant bg-surface-container-low p-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center border border-primary-container/40 bg-primary-container/10">
          <IconGroup size={28} className="text-primary" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="font-h2 text-h2">Nothing on the board yet</h2>
          <p className="text-body-main text-on-surface-variant">
            The board fills as candidates join this mandate. Upload a CV and
            the person lands in Found.
          </p>
        </div>
        {canWrite && (
          <Link
            href={`/app/projects/${projectId}/candidates/new`}
            prefetch={false}
            className="btn-notch flex items-center gap-2 bg-primary-container px-6 py-3 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <IconUpload size={16} />
            Add Candidate
          </Link>
        )}
      </div>
    );
  }

  const byStage = new Map<PipelineStage, BoardCandidate[]>(
    PIPELINE_STAGES.map((s) => [s, []])
  );
  for (const c of candidates) {
    const stage = overlay[c.id] ?? stageOf(c);
    (byStage.get(stage) ?? byStage.get("found"))!.push(c);
  }

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const rows = byStage.get(stage) ?? [];
          const accent = STAGE_ACCENTS[stage];
          const isDropTarget =
            dragView !== null && dropStage === stage && stage !== dragView.from;
          return (
            <section
              key={stage}
              data-stage={stage}
              aria-label={`${PIPELINE_LABELS[stage]} — ${rows.length}`}
              className={cn(
                "flex w-[248px] shrink-0 flex-col border border-outline-variant bg-surface-container-low",
                isDropTarget && "border-primary bg-primary/[0.04]"
              )}
            >
              <div className={cn("h-0.5", accent.bar)} />
              <header className="flex items-center justify-between gap-2 border-b border-outline-variant px-3 py-2.5">
                <h2
                  className={cn(
                    "truncate font-mono-label text-mono-label uppercase tracking-widest",
                    accent.text
                  )}
                >
                  {PIPELINE_LABELS[stage]}
                </h2>
                <span className="font-mono-data text-[13px] tabular-nums text-outline">
                  {String(rows.length).padStart(2, "0")}
                </span>
              </header>
              <div className="min-h-[96px] flex-1 space-y-2 p-2">
                {rows.length === 0 ? (
                  <p
                    className={cn(
                      "px-1 py-3 text-center font-mono-label text-[10px] uppercase tracking-wider",
                      isDropTarget ? "text-primary" : "text-outline/60"
                    )}
                  >
                    {isDropTarget ? "Drop here" : "—"}
                  </p>
                ) : (
                  rows.map((c) => (
                    <BoardCard
                      key={c.id}
                      candidate={c}
                      projectId={projectId}
                      stage={overlay[c.id] ?? stageOf(c)}
                      canWrite={canWrite}
                      pending={pendingId === c.id}
                      dragging={dragView?.id === c.id}
                      onPointerDown={handleCardPointerDown}
                      onMove={commit}
                      suppressClickRef={suppressClickRef}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* The card travelling under the pointer. */}
      {dragView?.started && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 border border-primary bg-surface-container-high px-3 py-2.5"
          style={{
            left: dragView.x + 10,
            top: dragView.y + 6,
            width: dragView.width,
          }}
        >
          <p className="truncate text-body-main font-semibold text-on-surface">
            {dragView.name}
          </p>
          <p className="mt-0.5 font-mono-label text-[10px] uppercase tracking-wider text-primary">
            {dropStage && dropStage !== dragView.from
              ? `→ ${PIPELINE_LABELS[dropStage]}`
              : PIPELINE_LABELS[dragView.from]}
          </p>
        </div>
      )}
    </>
  );
}

function BoardCard({
  candidate,
  projectId,
  stage,
  canWrite,
  pending,
  dragging,
  onPointerDown,
  onMove,
  suppressClickRef,
}: {
  candidate: BoardCandidate;
  projectId: string;
  stage: PipelineStage;
  canWrite: boolean;
  pending: boolean;
  dragging: boolean;
  onPointerDown: (
    e: React.PointerEvent<HTMLElement>,
    c: BoardCandidate
  ) => void;
  onMove: (id: string, name: string, to: PipelineStage) => void;
  suppressClickRef: React.RefObject<boolean>;
}) {
  return (
    <article
      onPointerDown={(e) => {
        // The select is its own control; dragging from it would swallow
        // the option list.
        if ((e.target as HTMLElement).closest("select")) return;
        onPointerDown(e, candidate);
      }}
      onClickCapture={(e) => {
        if (suppressClickRef.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={cn(
        "select-none border border-outline-variant bg-surface-container-high px-3 py-2.5 transition-colors",
        canWrite && "cursor-grab hover:border-primary",
        dragging && "opacity-40",
        pending && "opacity-60"
      )}
    >
      <div className="flex items-center gap-2">
        <Link
          href={`/app/projects/${projectId}/candidates/${candidate.id}`}
          prefetch={false}
          draggable={false}
          className="min-w-0 flex-1 truncate text-body-main font-semibold text-on-surface hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {candidate.full_name}
        </Link>
        {candidate.cv_processing && (
          <IconRefresh
            size={12}
            className="shrink-0 animate-spin text-primary"
            aria-label="Parsing"
          />
        )}
      </div>
      <p className="mt-0.5 truncate font-mono-data text-[12px] text-on-surface-variant">
        {candidate.current_title ?? "—"}
        {candidate.current_company ? ` @ ${candidate.current_company}` : ""}
      </p>
      {candidate.cv_parse_error && (
        <p className="mt-1 font-mono-label text-[10px] uppercase tracking-wider text-error">
          Parse failed
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono-label text-[10px] uppercase tracking-wider text-outline">
          {formatRelative(candidate.updated_at)}
        </span>
        {canWrite && (
          <select
            value={stage}
            disabled={pending}
            aria-label={`Move ${candidate.full_name} to stage`}
            onChange={(e) => {
              const to = e.target.value as PipelineStage;
              if (to !== stage) onMove(candidate.id, candidate.full_name, to);
            }}
            className="max-w-[110px] border border-outline-variant bg-transparent px-1 py-0.5 font-mono-label text-[10px] uppercase tracking-wider text-outline outline-none transition-colors focus:border-primary disabled:opacity-60"
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s} className="bg-surface text-on-surface">
                {PIPELINE_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </div>
    </article>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return "JUST NOW";
  if (min < 60) return `${min}M AGO`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}D AGO`;
  return new Date(iso).toISOString().slice(0, 10);
}
