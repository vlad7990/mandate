"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SOURCE_PLATFORMS } from "@/lib/sourcing/runs";
import type { MappingOverrides, ImportField } from "@/lib/sourcing/import";
import {
  IconAlert,
  IconCheck,
  IconRefresh,
  IconUpload,
} from "@/components/icons";
import {
  previewImportAction,
  stageImportAction,
  type ImportPreview,
} from "../../actions";
import { unwrap } from "@/lib/actions/result";
import { SelectField } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

/**
 * Paste or CSV → column mapping → stage.
 *
 * Nothing personal is written until the recruiter has seen the mapping land
 * correctly: the preview step parses server-side and returns counts and a
 * sample, and only "Stage" persists rows.
 *
 * Screenshot/OCR import is deliberately absent. It is automated extraction of a
 * platform's UI by another route and carries exactly the ToS exposure the rest
 * of this design avoids.
 */

const FIELDS: Array<{ key: ImportField; label: string; required?: boolean }> = [
  { key: "full_name", label: "Name", required: true },
  { key: "current_title", label: "Title" },
  { key: "current_company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "profile_url", label: "Profile URL" },
  { key: "email", label: "Email" },
];

export function ImportWizard({
  projectId,
  runId,
}: {
  projectId: string;
  runId: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sourceType, setSourceType] = useState<"paste" | "csv">("paste");
  const [filename, setFilename] = useState<string | null>(null);
  const [platform, setPlatform] = useState("linkedin_recruiter");
  const [overrides, setOverrides] = useState<MappingOverrides>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pending, start] = useTransition();

  const runPreview = (nextOverrides: MappingOverrides) => {
    if (!text.trim()) {
      toast.error("Paste some rows or choose a CSV first.");
      return;
    }
    start(async () => {
      try {
        const result = unwrap(await previewImportAction(projectId, text, nextOverrides));
        setPreview(result);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not read that.");
      }
    });
  };

  const changeMapping = (field: ImportField, value: string) => {
    const next: MappingOverrides = {
      ...overrides,
      [field]: value === "" ? null : Number(value),
    };
    setOverrides(next);
    runPreview(next);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
    setSourceType("csv");
    setFilename(file.name);
    setPreview(null);
    setOverrides({});
  };

  const stage = () => {
    if (!preview || preview.parsedCount === 0) return;
    start(async () => {
      try {
        const summary = unwrap(await stageImportAction(projectId, runId, {
          text,
          overrides,
          sourceType,
          filename,
          platform,
        }));
        toast.success(
          `${summary.staged} rows staged · ${summary.newCount} new, ${summary.duplicateCount} duplicate, ${summary.ambiguousCount} ambiguous`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <section className="bg-surface-container-low border border-outline-variant">
        <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center justify-between gap-3 flex-wrap">
          <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
            Step 1 · Bring the results back
          </span>
          <div className="flex items-center gap-2">
            <label className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Found on
            </label>
            <SelectField
              aria-label="Source platform"
              value={platform}
              onValueChange={setPlatform}
              disabled={pending}
              options={SOURCE_PLATFORMS.map((p) => ({
                value: p.value,
                label: p.label,
              }))}
              className="h-auto w-auto min-w-44 bg-surface-container-lowest px-2 py-1 tracking-widest"
            />
          </div>
        </header>

        <div className="p-4 space-y-3">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSourceType("paste");
              setFilename(null);
              setPreview(null);
              setOverrides({});
            }}
            disabled={pending}
            rows={8}
            placeholder={
              "Name,Title,Company,Location,Profile URL\nDana Reed,VP Engineering,Northwind,Berlin,https://www.linkedin.com/in/danareed"
            }
            className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface placeholder:text-outline resize-y focus-visible:outline-none focus-visible:border-primary"
          />

          <div className="flex items-center gap-3 flex-wrap">
            <label className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 cursor-pointer">
              <IconUpload size={14} />
              Choose CSV
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                disabled={pending}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {filename && (
              <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
                {filename}
              </span>
            )}
            <Button
              variant="primary"
              type="button"
              onClick={() => runPreview(overrides)}
              disabled={pending || !text.trim()}
              className="flex"
            >
              {pending ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : (
                <IconCheck size={14} />
              )}
              Read rows
            </Button>
          </div>
        </div>
      </section>

      {preview && (
        <section className="bg-surface-container-low border border-outline-variant">
          <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
            Step 2 · Check the columns
          </header>

          <div className="p-4 space-y-4">
            <ImportCounts preview={preview} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {FIELDS.map((field) => (
                <label key={field.key} className="space-y-1">
                  <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                    {field.label}
                    {field.required && <span className="text-primary"> *</span>}
                  </span>
                  <SelectField
                    aria-label={`Column for ${field.key}`}
                    tone="text"
                    value={String(preview.mapping[field.key] ?? "")}
                    onValueChange={(value) => changeMapping(field.key, value)}
                    disabled={pending}
                    options={[
                      { value: "", label: "— not mapped —" },
                      ...preview.headers.map((h, i) => ({
                        value: String(i),
                        label: h || `Column ${i + 1}`,
                      })),
                    ]}
                    className="h-auto w-full bg-surface-container-lowest px-2 py-1.5 font-mono-data"
                  />
                </label>
              ))}
            </div>

            <p className="font-mono-data text-body-main text-on-surface-variant">
              Columns you do not map are kept as supplied on each row, so nothing
              from the export is lost.
            </p>

            {preview.sample.length > 0 && <SampleTable preview={preview} />}

            <Button
              variant="primary"
              size="md"
              type="button"
              onClick={stage}
              disabled={pending || preview.parsedCount === 0}
              className="flex"
            >
              {pending ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : (
                <IconUpload size={14} />
              )}
              Stage {preview.parsedCount} rows for review
            </Button>
            <p className="font-mono-data text-body-main text-on-surface-variant">
              Staging records what this run returned. Nobody becomes a candidate
              until you confirm them on the next screen.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Counts, including the two that are easy to lose.
 *
 * `skippedUnnamed` is NOT a fourth review class — the parser never emits a
 * nameless row, so there is nothing to review — but it is reported, because a
 * silently shorter import is how a recruiter ends up believing a strategy
 * under-performed when in fact the name column was mis-detected.
 */
function ImportCounts({ preview }: { preview: ImportPreview }) {
  return (
    <div className="flex items-baseline gap-x-5 gap-y-1 flex-wrap font-mono-label text-mono-label uppercase tracking-widest tabular-nums">
      <span className="text-on-surface">
        {preview.parsedCount} row{preview.parsedCount === 1 ? "" : "s"} readable
      </span>
      {preview.skippedUnnamed > 0 && (
        <span className="text-tertiary flex items-center gap-1.5">
          <IconAlert size={12} />
          {preview.skippedUnnamed} skipped · no name
        </span>
      )}
      {preview.droppedForCap > 0 && (
        <span className="text-error flex items-center gap-1.5">
          <IconAlert size={12} />
          {preview.droppedForCap} beyond the {preview.maxRows}-row limit
        </span>
      )}
    </div>
  );
}

function SampleTable({ preview }: { preview: ImportPreview }) {
  return (
    <div className="overflow-x-auto border border-outline-variant">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-surface-container-high">
            {["Line", "Name", "Title", "Company", "Location"].map((h) => (
              <th
                key={h}
                className="text-left px-3 py-1.5 font-mono-label text-mono-label text-outline uppercase tracking-widest whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/40">
          {preview.sample.map((r) => (
            <tr key={r.source_line}>
              <td className="px-3 py-1.5 font-mono-data text-body-main text-outline tabular-nums">
                {r.source_line}
              </td>
              <td
                className={cn(
                  "px-3 py-1.5 font-mono-data text-body-main",
                  "text-on-surface"
                )}
              >
                {r.full_name}
              </td>
              <td className="px-3 py-1.5 font-mono-data text-body-main text-on-surface-variant">
                {r.current_title ?? "—"}
              </td>
              <td className="px-3 py-1.5 font-mono-data text-body-main text-on-surface-variant">
                {r.current_company ?? "—"}
              </td>
              <td className="px-3 py-1.5 font-mono-data text-body-main text-on-surface-variant">
                {r.location ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
