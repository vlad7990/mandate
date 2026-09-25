"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { uploadAndParseCv } from "../../projects/[id]/candidates/actions";
import { IconClose, IconRefresh, IconArrowRight } from "@/components/icons";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/actions/result";

export type IntakeMandate = {
  id: string;
  title: string;
  companyName: string | null;
  /** Whether `dimension_weights` exist — see the note on the picker. */
  calibrated: boolean;
};

/** The batch cap, stated in the UI rather than discovered on submit. */
export const MAX_FILES = 20;

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type FileState = {
  file: File;
  status: "waiting" | "parsing" | "parsed" | "failed" | "skipped";
  message?: string;
  candidateId?: string;
};

/**
 * Bulk CV intake (§200 slice 2).
 *
 * ONE FILE AT A TIME, on purpose. Each CV is a billed parse, and a batch
 * that fails atomically would throw away work already paid for. Uploading
 * is the recruiter's own act (the 091 D2/D5 split that onboarding uses):
 * whatever landed, landed, and the screen says so per file.
 *
 * The loop STOPS on a refusal that will repeat — a mandate whose spec and
 * calibration disagree (§177's door) refuses every file for the same
 * reason, and grinding through twenty identical refusals would be a worse
 * explanation than one.
 */
export function IntakeForm({ mandates }: { mandates: IntakeMandate[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mandateId, setMandateId] = useState<string>("");
  const [files, setFiles] = useState<FileState[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const mandate = mandates.find((m) => m.id === mandateId) ?? null;
  const pending = files.filter((f) => f.status === "waiting").length;
  const canRun = Boolean(mandateId) && pending > 0 && !running;

  function addFiles(list: FileList | null) {
    if (!list) return;
    setDone(false);
    setFiles((prev) => {
      const room = MAX_FILES - prev.length;
      if (room <= 0) {
        toast.error(`That is the cap — ${MAX_FILES} files per batch.`);
        return prev;
      }
      const incoming = Array.from(list);
      const dropped = incoming.length - room;
      const next = incoming.slice(0, room).map<FileState>((file) => {
        // Refused here rather than at the server, because a 12 MB file
        // should not cost an upload before anyone says it is too big.
        if (file.size > MAX_FILE_BYTES) {
          return {
            file,
            status: "skipped",
            message: `${(file.size / 1024 / 1024).toFixed(1)} MB — over the 10 MB limit.`,
          };
        }
        if (file.size === 0) {
          return { file, status: "skipped", message: "The file is empty." };
        }
        return { file, status: "waiting" };
      });
      if (dropped > 0) {
        toast.error(
          `${dropped} ${dropped === 1 ? "file was" : "files were"} left out — the cap is ${MAX_FILES} per batch.`
        );
      }
      return [...prev, ...next];
    });
  }

  function removeAt(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function run() {
    if (!canRun) return;
    setRunning(true);
    setDone(false);

    // Snapshot the indices to process, so a re-render mid-run cannot
    // shift what the loop is working on.
    const queue = files
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.status === "waiting");

    for (const { i } of queue) {
      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "parsing" } : f))
      );

      const form = new FormData();
      form.set("projectId", mandateId);
      form.set("cv", files[i].file);

      let message: string;
      try {
        const { candidateId } = unwrap(await uploadAndParseCv(form));
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "parsed", candidateId } : f
          )
        );
        continue;
      } catch (err) {
        message = err instanceof Error ? err.message : "The parse failed.";
      }

      setFiles((prev) =>
        prev.map((f, idx) =>
          idx === i ? { ...f, status: "failed", message } : f
        )
      );

      // A refusal about the MANDATE, not the file, will repeat for every
      // remaining CV. Stop and say so once.
      if (/spec|calibrat/i.test(message)) {
        setFiles((prev) =>
          prev.map((f) =>
            f.status === "waiting"
              ? {
                  ...f,
                  status: "skipped",
                  message: "Not attempted — the mandate refused the batch.",
                }
              : f
          )
        );
        toast.error("The mandate refused the upload — nothing further was tried.");
        break;
      }
    }

    setRunning(false);
    setDone(true);
    router.refresh();
  }

  const parsed = files.filter((f) => f.status === "parsed").length;
  const failed = files.filter((f) => f.status === "failed").length;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <label
          htmlFor="mandate"
          className="block font-mono-label text-mono-label uppercase tracking-widest text-outline"
        >
          Mandate
        </label>
        <select
          id="mandate"
          value={mandateId}
          disabled={running}
          onChange={(e) => setMandateId(e.target.value)}
          className="w-full max-w-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          <option value="">— Choose the search these CVs belong to —</option>
          {mandates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
              {m.companyName ? ` · ${m.companyName}` : ""}
              {m.calibrated ? "" : " (not calibrated)"}
            </option>
          ))}
        </select>

        {/*
          §197's rule, applied here: say what is true about the state
          rather than letting the reader assume. A parse reads the
          mandate's calibration to produce its fit-vs-role analysis, so
          uploading into an uncalibrated mandate parses the CV but has
          nothing to judge it against.
        */}
        {mandate && !mandate.calibrated && (
          <p className="max-w-xl text-body-main leading-relaxed text-warn">
            This mandate has no scoring model yet. The CVs will be read and
            the people created, but there is nothing to score them against
            until onboarding has run — so no fit analysis comes back.
          </p>
        )}
        {mandates.length === 0 && (
          <p className="max-w-xl text-body-main leading-relaxed text-on-surface-variant">
            There are no mandates to upload into yet. Create one first, and
            its CVs have somewhere to go.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!running) addFiles(e.dataTransfer.files);
          }}
          className="border border-dashed border-outline-variant bg-surface-container-lowest px-4 py-6 text-center"
        >
          <p className="text-body-main text-on-surface-variant">
            Drop CVs here, or{" "}
            <button
              type="button"
              disabled={running}
              onClick={() => inputRef.current?.click()}
              className="text-primary underline underline-offset-2 disabled:opacity-60"
            >
              choose files
            </button>
            .
          </p>
          <p className="mt-1 font-mono-label text-mono-label uppercase tracking-widest text-outline">
            PDF or DOCX · up to 10 MB each · {MAX_FILES} per batch
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              // Let the same file be chosen again after a removal.
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="divide-y divide-outline-variant/60 border border-outline-variant">
            {files.map((f, i) => (
              <li
                key={`${f.file.name}-${i}`}
                className="flex items-center gap-3 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-body-main text-on-surface">
                  {f.file.name}
                </span>
                <span className="shrink-0 font-mono-data text-mono-label text-outline tabular-nums">
                  {(f.file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <StatusChip state={f} candidateHref={
                  f.candidateId
                    ? `/app/projects/${mandateId}/candidates/${f.candidateId}`
                    : null
                } />
                {f.status === "waiting" && !running && (
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label={`Remove ${f.file.name}`}
                    className="shrink-0 text-outline transition-colors hover:text-on-surface"
                  >
                    <IconClose size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {files.some((f) => f.message) && (
          <ul className="space-y-1">
            {files
              .map((f, i) => ({ f, i }))
              .filter(({ f }) => f.message)
              .map(({ f, i }) => (
                <li
                  key={`msg-${i}`}
                  className="text-body-main leading-relaxed text-on-surface-variant"
                >
                  <span className="text-on-surface">{f.file.name}</span> —{" "}
                  {f.message}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={!canRun}
          aria-busy={running ? true : undefined}
          className="btn-notch flex items-center gap-2 bg-primary-container px-4 py-2 font-mono-label text-[11px] font-semibold uppercase tracking-[0.1em] text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running && <IconRefresh size={14} className="animate-spin" />}
          Upload and parse
          {pending > 0 ? ` · ${pending}` : ""}
        </button>

        {/* The bill, before the click — not after it. */}
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline tabular-nums">
          {pending > 0
            ? `${pending} ${pending === 1 ? "parse" : "parses"} will run`
            : "nothing queued"}
        </p>

        {done && (
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant">
            {parsed} parsed{failed > 0 ? ` · ${failed} failed` : ""}
          </p>
        )}

        {done && parsed > 0 && mandateId && (
          <Link
            href={`/app/projects/${mandateId}/candidates`}
            prefetch={false}
            className="flex items-center gap-1.5 border border-outline-variant px-3 py-2 font-mono-label text-[11px] uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
          >
            See them in the mandate
            <IconArrowRight size={14} />
          </Link>
        )}
      </section>
    </div>
  );
}

function StatusChip({
  state,
  candidateHref,
}: {
  state: FileState;
  candidateHref: string | null;
}) {
  const label =
    state.status === "waiting"
      ? "QUEUED"
      : state.status === "parsing"
        ? "PARSING"
        : state.status === "parsed"
          ? "PARSED"
          : state.status === "failed"
            ? "FAILED"
            : "SKIPPED";

  const tone =
    state.status === "parsed"
      ? "border-secondary/40 text-secondary"
      : state.status === "failed"
        ? "border-error/50 text-error"
        : state.status === "parsing"
          ? "border-primary-container text-primary"
          : "border-outline-variant text-outline";

  const chip = (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 border px-2 py-0.5 font-mono-label text-mono-label uppercase tracking-widest",
        tone
      )}
    >
      {state.status === "parsing" && (
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse bg-primary" />
      )}
      {label}
    </span>
  );

  if (state.status === "parsed" && candidateHref) {
    return (
      <Link href={candidateHref} prefetch={false} className="shrink-0">
        {chip}
      </Link>
    );
  }
  return chip;
}
